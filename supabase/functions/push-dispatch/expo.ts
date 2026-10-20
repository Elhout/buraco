// Expo Push API helpers. Pure: `fetch` is passed in, so these run in Deno and in vitest alike.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
export const EXPO_CHUNK_SIZE = 100
export const MAX_ATTEMPTS = 3

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface ExpoMessage {
  to: string
  title: string
  body: string
  data: { url: string }
  sound: 'default'
  channelId: 'default'
}

/** What happened to one message: delivered to Expo, or an error with retry/dead-token hints. */
export type SendOutcome = { ok: true } | { ok: false; message: string; transient: boolean; deviceNotRegistered: boolean }

export type RowStatus = 'sent' | 'skipped' | 'failed' | 'queued'

export interface RowResult {
  status: RowStatus
  error: string | null
}

// Ticket-level errors worth retrying later; everything else is permanent for this message.
const TRANSIENT_TICKET_ERRORS: ReadonlySet<string> = new Set(['MessageRateExceeded'])

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('chunk size must be a positive integer')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const buildMessage = (to: string, title: string, body: string, url: string): ExpoMessage => ({
  to,
  title,
  body,
  data: { url },
  sound: 'default',
  channelId: 'default',
})

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Expo echoes the token in some error messages; keep tokens out of the queue's error column.
const redactTokens = (text: string): string => text.replace(/Expo(nent)?PushToken\[[^\]]*\]/g, 'ExpoPushToken[…]')

/** Maps one Expo push ticket (`{status:'ok'}` or `{status:'error', message, details:{error}}`). */
export const ticketOutcome = (ticket: unknown): SendOutcome => {
  if (isRecord(ticket) && ticket['status'] === 'ok') return { ok: true }
  const details = isRecord(ticket) && isRecord(ticket['details']) ? ticket['details'] : {}
  const code = typeof details['error'] === 'string' ? details['error'] : null
  const text = isRecord(ticket) && typeof ticket['message'] === 'string' ? redactTokens(ticket['message']) : 'invalid push ticket'
  return {
    ok: false,
    message: code ? `${code}: ${text}` : text,
    transient: code !== null && TRANSIENT_TICKET_ERRORS.has(code),
    deviceNotRegistered: code === 'DeviceNotRegistered',
  }
}

const failAll = (count: number, message: string, transient: boolean): SendOutcome[] =>
  Array.from({ length: count }, () => ({ ok: false as const, message, transient, deviceNotRegistered: false }))

const isTransientHttp = (status: number): boolean => status >= 500 || status === 429

const buildHeaders = (accessToken: string | null): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return headers
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Sends ≤100 messages in one request. Never throws; returns one outcome per message, in order. */
export const sendChunk = async (fetchFn: FetchFn, messages: readonly ExpoMessage[], accessToken: string | null): Promise<SendOutcome[]> => {
  if (messages.length === 0) return []
  let res: Response
  try {
    res = await fetchFn(EXPO_PUSH_URL, { method: 'POST', headers: buildHeaders(accessToken), body: JSON.stringify(messages) })
  } catch (e: unknown) {
    return failAll(messages.length, `network error: ${errorText(e)}`, true)
  }
  if (!res.ok) return failAll(messages.length, `expo http ${res.status}`, isTransientHttp(res.status))
  let json: unknown
  try {
    json = await res.json()
  } catch {
    return failAll(messages.length, 'expo returned invalid JSON', true)
  }
  const tickets = isRecord(json) && Array.isArray(json['data']) ? json['data'] : null
  if (tickets === null) return failAll(messages.length, 'expo response has no tickets', true)
  return messages.map((_, i) => ticketOutcome(tickets[i]))
}

/** Sends any number of messages in chunks of ≤100, sequentially. Outcomes line up with `messages`. */
export const sendAll = async (fetchFn: FetchFn, messages: readonly ExpoMessage[], accessToken: string | null): Promise<SendOutcome[]> => {
  const outcomes: SendOutcome[] = []
  for (const part of chunk(messages, EXPO_CHUNK_SIZE)) outcomes.push(...(await sendChunk(fetchFn, part, accessToken)))
  return outcomes
}

/**
 * Status for one queue row from the outcomes of its messages (one per device token).
 * Any delivered ticket → sent. All failed → failed, or queued again when every failure is transient
 * and the row has been tried fewer than MAX_ATTEMPTS times (`attempts` counts the current try).
 */
export const rowResult = (outcomes: readonly SendOutcome[], attempts: number): RowResult => {
  if (outcomes.length === 0) return { status: 'skipped', error: null }
  if (outcomes.some((o) => o.ok)) return { status: 'sent', error: null }
  const errors = outcomes.filter((o): o is Extract<SendOutcome, { ok: false }> => !o.ok)
  const retry = errors.every((o) => o.transient) && attempts < MAX_ATTEMPTS
  const error = [...new Set(errors.map((o) => o.message))].join('; ')
  return { status: retry ? 'queued' : 'failed', error }
}

/** Tokens whose ticket said DeviceNotRegistered; `tokens[i]` is the recipient of `outcomes[i]`. */
export const deadTokens = (tokens: readonly string[], outcomes: readonly SendOutcome[]): string[] => {
  const dead = tokens.filter((_, i) => {
    const o = outcomes[i]
    return o !== undefined && !o.ok && o.deviceNotRegistered
  })
  return [...new Set(dead)]
}
