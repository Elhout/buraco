// Drains public.notification_queue: claim a batch, format each push, send through Expo (and Web Push
// for web-app devices), report back.
// Shared by push-dispatch and game-cron. The database client is an interface, so this is testable
// without Deno or a live project.

import { deadTokens, type ExpoMessage, type FetchFn, type SendOutcome, buildMessage, rowResult, sendAll } from '../push-dispatch/expo.ts'
import { formatPush, type Lang } from './messages.ts'
import { parseWebSubscriptions, webPayload, type WebPushSender, type WebSubscription } from './webpush.ts'

export const CLAIM_LIMIT = 100
export const MAX_BATCHES = 10

export interface RpcError {
  code?: string
  message: string
}

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>
}

/** One row as returned by claim_notifications. */
export interface ClaimedRow {
  id: string
  event: string
  payload: Record<string, unknown>
  deep_link: string
  lang: Lang
  tokens: string[]
  /** Web-app devices (Web Push subscriptions). */
  web: WebSubscription[]
  /** Not returned by claim_notifications yet; without it a row is never re-queued. */
  attempts: number | null
}

export interface FinishResult {
  id: string
  status: 'sent' | 'skipped' | 'failed' | 'queued'
  error: string | null
}

export interface DispatchSummary {
  batches: number
  claimed: number
  sent: number
  skipped: number
  failed: number
  requeued: number
  deadTokens: number
}

export interface DispatchOptions {
  fetchFn: FetchFn
  expoAccessToken: string | null
  /** Sends Web Push; null or absent when VAPID keys are not configured (web devices are then skipped). */
  webPush?: WebPushSender | null
  claimLimit?: number
  maxBatches?: number
}

export class DispatchError extends Error {
  constructor(step: string, cause: RpcError) {
    super(`${step} failed: ${cause.code ?? 'unknown'} ${cause.message}`)
    this.name = 'DispatchError'
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validates one claimed row; rows without an id return null (claim_notifications always sets one). */
export const parseRow = (raw: unknown): ClaimedRow | null => {
  if (!isRecord(raw) || typeof raw['id'] !== 'string') return null
  const tokens = Array.isArray(raw['tokens']) ? raw['tokens'].filter((t): t is string => typeof t === 'string' && t !== '') : []
  const attempts = raw['attempts']
  return {
    id: raw['id'],
    event: typeof raw['event'] === 'string' ? raw['event'] : '',
    payload: isRecord(raw['payload']) ? raw['payload'] : {},
    deep_link: typeof raw['deep_link'] === 'string' ? raw['deep_link'] : '/',
    lang: raw['lang'] === 'ar' ? 'ar' : 'en',
    tokens: [...new Set(tokens)],
    web: parseWebSubscriptions(raw['web']),
    attempts: typeof attempts === 'number' && Number.isFinite(attempts) ? attempts : null,
  }
}

const rowMessages = (row: ClaimedRow): ExpoMessage[] => {
  const { title, body } = formatPush(row.event, row.payload, row.lang)
  return row.tokens.map((to) => buildMessage(to, title, body, row.deep_link))
}

/** One outcome per web subscription of the row, in order; none when Web Push is off. */
const sendWeb = (row: ClaimedRow, webPush: WebPushSender | null | undefined): Promise<SendOutcome[]> => {
  if (!webPush || row.web.length === 0) return Promise.resolve([])
  const { title, body } = formatPush(row.event, row.payload, row.lang)
  const payload = webPayload(title, body, row.deep_link)
  return Promise.all(row.web.map((sub) => webPush(sub, payload)))
}

interface BatchOutcome {
  results: FinishResult[]
  deadTokens: string[]
}

/** Sends one claimed batch. Never throws (sendAll swallows network errors into outcomes). */
export const processBatch = async (rows: readonly ClaimedRow[], opts: DispatchOptions): Promise<BatchOutcome> => {
  const perRow = rows.map(rowMessages)
  const [outcomes, webOutcomes] = await Promise.all([
    sendAll(opts.fetchFn, perRow.flat(), opts.expoAccessToken),
    Promise.all(rows.map((row) => sendWeb(row, opts.webPush))),
  ])
  let offset = 0
  const results: FinishResult[] = []
  const dead: string[] = []
  rows.forEach((row, i) => {
    const count = perRow[i]?.length ?? 0
    const mine = outcomes.slice(offset, offset + count)
    const web = webOutcomes[i] ?? []
    offset += count
    // Unknown attempts → treat as the last try so a row can never loop forever.
    const { status, error } = rowResult([...mine, ...web], row.attempts ?? Number.POSITIVE_INFINITY)
    results.push({ id: row.id, status, error })
    dead.push(
      ...deadTokens(row.tokens, mine),
      ...deadTokens(
        row.web.map((w) => w.endpoint),
        web,
      ),
    )
  })
  return { results, deadTokens: [...new Set(dead)] }
}

const emptySummary = (): DispatchSummary => ({
  batches: 0,
  claimed: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  requeued: 0,
  deadTokens: 0,
})

const addBatch = (s: DispatchSummary, claimed: number, b: BatchOutcome): DispatchSummary => {
  const count = (status: FinishResult['status']): number => b.results.filter((r) => r.status === status).length
  return {
    batches: s.batches + 1,
    claimed: s.claimed + claimed,
    sent: s.sent + count('sent'),
    skipped: s.skipped + count('skipped'),
    failed: s.failed + count('failed'),
    requeued: s.requeued + count('queued'),
    deadTokens: s.deadTokens + b.deadTokens.length,
  }
}

const claim = async (client: RpcClient, limit: number): Promise<unknown[]> => {
  const { data, error } = await client.rpc('claim_notifications', { p_limit: limit })
  if (error) throw new DispatchError('claim_notifications', error)
  return Array.isArray(data) ? data : []
}

/**
 * Claims and sends until the queue is empty, a batch comes back short, a row is re-queued
 * (so it waits for the next run instead of burning its attempts now), or MAX_BATCHES is reached.
 */
export const dispatchQueue = async (client: RpcClient, opts: DispatchOptions): Promise<DispatchSummary> => {
  const limit = opts.claimLimit ?? CLAIM_LIMIT
  const maxBatches = opts.maxBatches ?? MAX_BATCHES
  let summary = emptySummary()
  for (let i = 0; i < maxBatches; i++) {
    const raw = await claim(client, limit)
    if (raw.length === 0) break
    const rows = raw.map(parseRow).filter((r): r is ClaimedRow => r !== null)
    const batch = await processBatch(rows, opts)
    const { error } = await client.rpc('finish_notifications', { p_results: batch.results, p_dead_tokens: batch.deadTokens })
    if (error) throw new DispatchError('finish_notifications', error)
    summary = addBatch(summary, raw.length, batch)
    if (raw.length < limit || batch.results.some((r) => r.status === 'queued')) break
  }
  return summary
}
