import { describe, expect, it } from 'vitest'
import { dispatchQueue, parseRow, type RpcClient } from '../../../supabase/functions/_shared/dispatch.ts'
import {
  parseWebSubscriptions,
  webOutcome,
  webPayload,
  type WebPushSender,
  type WebSubscription,
} from '../../../supabase/functions/_shared/webpush.ts'
import type { FetchFn } from '../../../supabase/functions/push-dispatch/expo.ts'

const sub = (endpoint: string): WebSubscription => ({ endpoint, p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) })

describe('web push helpers', () => {
  it('builds the payload the service worker reads', () => {
    expect(JSON.parse(webPayload('T', 'B', '/game/1'))).toEqual({ title: 'T', body: 'B', url: '/game/1' })
  })

  it('maps push service statuses', () => {
    expect(webOutcome(201)).toEqual({ ok: true })
    expect(webOutcome(410)).toMatchObject({ ok: false, deviceNotRegistered: true, transient: false })
    expect(webOutcome(404)).toMatchObject({ ok: false, deviceNotRegistered: true })
    expect(webOutcome(429)).toMatchObject({ ok: false, transient: true, deviceNotRegistered: false })
    expect(webOutcome(503)).toMatchObject({ ok: false, transient: true })
    expect(webOutcome(403)).toEqual({ ok: false, message: 'web push http 403', transient: false, deviceNotRegistered: false })
  })

  it('keeps well-formed, distinct subscriptions', () => {
    expect(parseWebSubscriptions([sub('https://a'), sub('https://a'), { endpoint: 'https://b' }, 'x', sub('https://c')])).toEqual([
      sub('https://a'),
      sub('https://c'),
    ])
    expect(parseWebSubscriptions(null)).toEqual([])
  })

  it('parseRow reads the web subscriptions of a claimed row', () => {
    expect(parseRow({ id: 'r1', web: [sub('https://a')] })?.web).toEqual([sub('https://a')])
    expect(parseRow({ id: 'r1' })?.web).toEqual([])
  })
})

interface RpcCall {
  fn: string
  args: Record<string, unknown> | undefined
}

const fakeDb = (rows: unknown[]): { client: RpcClient; calls: RpcCall[] } => {
  const calls: RpcCall[] = []
  let served = false
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args })
      if (fn !== 'claim_notifications') return { data: null, error: null }
      const data = served ? [] : rows
      served = true
      return { data, error: null }
    },
  }
  return { client, calls }
}

const expoOk: FetchFn = async (_url, init) => {
  const messages = JSON.parse(String(init?.body)) as unknown[]
  return new Response(JSON.stringify({ data: messages.map(() => ({ status: 'ok' })) }), { status: 200 })
}

const row = (id: string, tokens: string[], web: WebSubscription[], attempts = 1): Record<string, unknown> => ({
  id,
  event: 'round_to_confirm',
  payload: { round_no: 4, a: 350, b: 220 },
  deep_link: '/game/g1',
  lang: 'en',
  tokens,
  web,
  attempts,
})

const finish = (calls: RpcCall[]): Record<string, unknown> | undefined => calls.find((c) => c.fn === 'finish_notifications')?.args

describe('dispatchQueue with web subscriptions', () => {
  it('sends the formatted push to each web subscription and drops gone endpoints', async () => {
    const sent: [string, unknown][] = []
    const webPush: WebPushSender = async (s, payload) => {
      sent.push([s.endpoint, JSON.parse(payload)])
      return webOutcome(s.endpoint.endsWith('gone') ? 410 : 201)
    }
    const { client, calls } = fakeDb([row('r1', [], [sub('https://push/ok'), sub('https://push/gone')]), row('r2', ['tok'], [])])
    const summary = await dispatchQueue(client, { fetchFn: expoOk, expoAccessToken: null, webPush })

    expect(sent).toEqual([
      ['https://push/ok', { title: 'Round to confirm', body: 'Round 4: 350 vs 220. Confirm?', url: '/game/g1' }],
      ['https://push/gone', { title: 'Round to confirm', body: 'Round 4: 350 vs 220. Confirm?', url: '/game/g1' }],
    ])
    expect(finish(calls)).toEqual({
      p_results: [
        { id: 'r1', status: 'sent', error: null },
        { id: 'r2', status: 'sent', error: null },
      ],
      p_dead_tokens: ['https://push/gone'],
    })
    expect(summary).toMatchObject({ sent: 2, deadTokens: 1 })
  })

  it('re-queues a row whose only web push hit a transient error', async () => {
    const webPush: WebPushSender = async () => webOutcome(503)
    const { client, calls } = fakeDb([row('r1', [], [sub('https://push/busy')])])
    await dispatchQueue(client, { fetchFn: expoOk, expoAccessToken: null, webPush })
    expect(finish(calls)).toEqual({ p_results: [{ id: 'r1', status: 'queued', error: 'web push http 503' }], p_dead_tokens: [] })
  })

  it('skips web subscriptions when Web Push is not configured', async () => {
    const { client, calls } = fakeDb([row('r1', [], [sub('https://push/x')]), row('r2', ['tok'], [sub('https://push/y')])])
    await dispatchQueue(client, { fetchFn: expoOk, expoAccessToken: null, webPush: null })
    expect(finish(calls)).toEqual({
      p_results: [
        { id: 'r1', status: 'skipped', error: null },
        { id: 'r2', status: 'sent', error: null },
      ],
      p_dead_tokens: [],
    })
  })
})
