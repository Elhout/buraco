import { describe, expect, it } from 'vitest'
import { isAuthorized, timingSafeEqual } from '../../../supabase/functions/_shared/auth.ts'
import { dispatchQueue, parseRow, type RpcClient, type RpcError } from '../../../supabase/functions/_shared/dispatch.ts'
import {
  buildMessage,
  chunk,
  deadTokens,
  EXPO_PUSH_URL,
  type ExpoMessage,
  type FetchFn,
  rowResult,
  type SendOutcome,
  sendAll,
  sendChunk,
  ticketOutcome,
} from '../../../supabase/functions/push-dispatch/expo.ts'

interface FakeCall {
  url: string
  init: RequestInit | undefined
  messages: ExpoMessage[]
}

type Responder = (messages: ExpoMessage[]) => Response | Promise<Response>

const fakeFetch = (respond: Responder): { fetchFn: FetchFn; calls: FakeCall[] } => {
  const calls: FakeCall[] = []
  const fetchFn: FetchFn = async (url, init) => {
    const messages = JSON.parse(String(init?.body)) as ExpoMessage[]
    calls.push({ url, init, messages })
    return respond(messages)
  }
  return { fetchFn, calls }
}

const tickets = (list: unknown[]): Response => new Response(JSON.stringify({ data: list }), { status: 200 })
const allOk: Responder = (m) => tickets(m.map((_, i) => ({ status: 'ok', id: `t${i}` })))
const notRegistered = { status: 'error', message: '"x" is not a registered push token', details: { error: 'DeviceNotRegistered' } }

const msg = (to: string): ExpoMessage => buildMessage(to, 'T', 'B', '/game/1')
const okOutcome: SendOutcome = { ok: true }
const fail = (transient: boolean, deviceNotRegistered = false, message = 'boom'): SendOutcome => ({
  ok: false,
  message,
  transient,
  deviceNotRegistered,
})

describe('chunk', () => {
  it('splits into slices of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 100)).toEqual([])
    expect(
      chunk(
        Array.from({ length: 250 }, (_, i) => i),
        100,
      ).map((c) => c.length),
    ).toEqual([100, 100, 50])
  })

  it('rejects a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError)
  })
})

describe('buildMessage', () => {
  it('builds the Expo message shape with the deep link in data.url', () => {
    expect(buildMessage('ExponentPushToken[a]', 'Title', 'Body', '/game/1/invite')).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'Title',
      body: 'Body',
      data: { url: '/game/1/invite' },
      sound: 'default',
      channelId: 'default',
    })
  })
})

describe('ticketOutcome', () => {
  it('maps ok tickets', () => {
    expect(ticketOutcome({ status: 'ok', id: 'x' })).toEqual({ ok: true })
  })

  it('flags DeviceNotRegistered as a dead token, not transient', () => {
    expect(ticketOutcome(notRegistered)).toEqual({
      ok: false,
      message: 'DeviceNotRegistered: "x" is not a registered push token',
      transient: false,
      deviceNotRegistered: true,
    })
  })

  it('redacts push tokens echoed in error messages', () => {
    const ticket = {
      status: 'error',
      message: '"ExponentPushToken[abc123]" is not a registered push token',
      details: { error: 'DeviceNotRegistered' },
    }
    expect(ticketOutcome(ticket)).toMatchObject({ message: 'DeviceNotRegistered: "ExpoPushToken[…]" is not a registered push token' })
  })

  it('treats MessageRateExceeded as transient', () => {
    expect(ticketOutcome({ status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } })).toMatchObject({
      ok: false,
      transient: true,
      deviceNotRegistered: false,
    })
  })

  it('handles malformed tickets', () => {
    expect(ticketOutcome(undefined)).toEqual({ ok: false, message: 'invalid push ticket', transient: false, deviceNotRegistered: false })
    expect(ticketOutcome({ status: 'error', message: 'bad' })).toEqual({
      ok: false,
      message: 'bad',
      transient: false,
      deviceNotRegistered: false,
    })
  })
})

describe('sendChunk', () => {
  it('posts JSON to Expo and maps tickets in order', async () => {
    const { fetchFn, calls } = fakeFetch(() => tickets([{ status: 'ok' }, notRegistered]))
    const out = await sendChunk(fetchFn, [msg('a'), msg('b')], null)
    expect(out[0]).toEqual({ ok: true })
    expect(out[1]).toMatchObject({ ok: false, deviceNotRegistered: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(EXPO_PUSH_URL)
    expect(calls[0]?.init?.method).toBe('POST')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('sends the access token when configured', async () => {
    const { fetchFn, calls } = fakeFetch(allOk)
    await sendChunk(fetchFn, [msg('a')], 'expo-secret')
    expect((calls[0]?.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer expo-secret')
  })

  it('does not call fetch for an empty chunk', async () => {
    const { fetchFn, calls } = fakeFetch(allOk)
    expect(await sendChunk(fetchFn, [], null)).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [400, false],
    [401, false],
  ])('fails every message on HTTP %i (transient: %s)', async (status, transient) => {
    const { fetchFn } = fakeFetch(() => new Response('{"errors":[]}', { status }))
    const out = await sendChunk(fetchFn, [msg('a'), msg('b')], null)
    expect(out).toEqual([
      { ok: false, message: `expo http ${status}`, transient, deviceNotRegistered: false },
      { ok: false, message: `expo http ${status}`, transient, deviceNotRegistered: false },
    ])
  })

  it('treats a network error as transient', async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error('connection reset'))
    expect(await sendChunk(fetchFn, [msg('a')], null)).toEqual([
      { ok: false, message: 'network error: connection reset', transient: true, deviceNotRegistered: false },
    ])
  })

  it('treats invalid JSON or a missing ticket list as transient', async () => {
    const bad = fakeFetch(() => new Response('not json', { status: 200 }))
    expect((await sendChunk(bad.fetchFn, [msg('a')], null))[0]).toMatchObject({ ok: false, transient: true })
    const empty = fakeFetch(() => new Response('{}', { status: 200 }))
    expect((await sendChunk(empty.fetchFn, [msg('a')], null))[0]).toMatchObject({ ok: false, message: 'expo response has no tickets' })
  })

  it('marks messages without a ticket as failed', async () => {
    const { fetchFn } = fakeFetch(() => tickets([{ status: 'ok' }]))
    const out = await sendChunk(fetchFn, [msg('a'), msg('b')], null)
    expect(out[1]).toMatchObject({ ok: false, message: 'invalid push ticket' })
  })
})

describe('sendAll', () => {
  it('sends in chunks of at most 100 and keeps outcomes aligned', async () => {
    const { fetchFn, calls } = fakeFetch((m) => tickets(m.map((x) => (x.to === 'dead' ? notRegistered : { status: 'ok' }))))
    const messages = Array.from({ length: 250 }, (_, i) => msg(i === 175 ? 'dead' : `t${i}`))
    const out = await sendAll(fetchFn, messages, null)
    expect(calls.map((c) => c.messages.length)).toEqual([100, 100, 50])
    expect(out).toHaveLength(250)
    expect(out[175]).toMatchObject({ ok: false, deviceNotRegistered: true })
    expect(out.filter((o) => o.ok)).toHaveLength(249)
  })
})

describe('rowResult', () => {
  it('is skipped with no outcomes (no tokens)', () => {
    expect(rowResult([], 1)).toEqual({ status: 'skipped', error: null })
  })

  it('is sent when any ticket is ok', () => {
    expect(rowResult([fail(false, true), okOutcome], 1)).toEqual({ status: 'sent', error: null })
  })

  it('is queued again when every error is transient and attempts remain', () => {
    expect(rowResult([fail(true, false, 'expo http 502')], 1)).toEqual({ status: 'queued', error: 'expo http 502' })
    expect(rowResult([fail(true)], 2).status).toBe('queued')
  })

  it('fails on the last attempt', () => {
    expect(rowResult([fail(true)], 3)).toEqual({ status: 'failed', error: 'boom' })
  })

  it('fails when any error is permanent, joining distinct messages', () => {
    expect(rowResult([fail(true, false, 'a'), fail(false, false, 'b'), fail(false, false, 'b')], 1)).toEqual({
      status: 'failed',
      error: 'a; b',
    })
  })
})

describe('deadTokens', () => {
  it('returns unique tokens with DeviceNotRegistered tickets', () => {
    const out = deadTokens(['a', 'b', 'c', 'b'], [okOutcome, fail(false, true), fail(true), fail(false, true)])
    expect(out).toEqual(['b'])
  })

  it('ignores tokens without an outcome', () => {
    expect(deadTokens(['a', 'b'], [fail(false, true)])).toEqual(['a'])
  })
})

describe('auth', () => {
  it('compares strings in constant time', () => {
    expect(timingSafeEqual('secret', 'secret')).toBe(true)
    expect(timingSafeEqual('secret', 'secreT')).toBe(false)
    expect(timingSafeEqual('secret', 'secret2')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('accepts a bearer token matching any configured secret', () => {
    expect(isAuthorized('Bearer service', ['service', 'cron'])).toBe(true)
    expect(isAuthorized('bearer  cron ', ['service', 'cron'])).toBe(true)
  })

  it('rejects missing, malformed or wrong tokens and never matches empty secrets', () => {
    expect(isAuthorized(null, ['service'])).toBe(false)
    expect(isAuthorized('service', ['service'])).toBe(false)
    expect(isAuthorized('Bearer nope', ['service', null, undefined])).toBe(false)
    expect(isAuthorized('Bearer ', ['', null])).toBe(false)
  })
})

// ---------------------------------------------------------------- dispatchQueue with a fake database

interface RpcCall {
  fn: string
  args: Record<string, unknown> | undefined
}

const fakeDb = (batches: unknown[][], errors: Partial<Record<string, RpcError>> = {}): { client: RpcClient; calls: RpcCall[] } => {
  const calls: RpcCall[] = []
  const queue = [...batches]
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args })
      const error = errors[fn] ?? null
      if (error) return { data: null, error }
      return { data: fn === 'claim_notifications' ? (queue.shift() ?? []) : null, error: null }
    },
  }
  return { client, calls }
}

const row = (id: string, tokens: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  event: 'round_to_confirm',
  payload: { round_no: 4, a: 350, b: 220 },
  deep_link: '/game/g1',
  lang: 'en',
  tokens,
  ...extra,
})

const finishCalls = (calls: RpcCall[]): RpcCall[] => calls.filter((c) => c.fn === 'finish_notifications')

describe('parseRow', () => {
  it('normalises a claimed row', () => {
    expect(parseRow(row('r1', ['a', 'a', '', 5 as unknown as string], { lang: 'ar', attempts: 2 }))).toEqual({
      id: 'r1',
      event: 'round_to_confirm',
      payload: { round_no: 4, a: 350, b: 220 },
      deep_link: '/game/g1',
      lang: 'ar',
      tokens: ['a'],
      web: [],
      attempts: 2,
    })
  })

  it('defaults missing fields and rejects rows without an id', () => {
    expect(parseRow({ id: 'r2' })).toEqual({
      id: 'r2',
      event: '',
      payload: {},
      deep_link: '/',
      lang: 'en',
      tokens: [],
      web: [],
      attempts: null,
    })
    expect(parseRow({ event: 'x' })).toBeNull()
    expect(parseRow('nope')).toBeNull()
  })
})

describe('dispatchQueue', () => {
  it('formats, sends and reports each row, removing dead tokens', async () => {
    const { client, calls } = fakeDb([[row('r1', ['tok1', 'dead']), row('r2', []), row('r3', ['tok3'], { lang: 'ar' })]])
    const expo = fakeFetch((m) => tickets(m.map((x) => (x.to === 'dead' ? notRegistered : { status: 'ok' }))))
    const summary = await dispatchQueue(client, { fetchFn: expo.fetchFn, expoAccessToken: null })

    expect(expo.calls).toHaveLength(1)
    expect(expo.calls[0]?.messages.map((m) => [m.to, m.body, m.data.url])).toEqual([
      ['tok1', 'Round 4: 350 vs 220. Confirm?', '/game/g1'],
      ['dead', 'Round 4: 350 vs 220. Confirm?', '/game/g1'],
      ['tok3', 'الجولة 4: 350 مقابل 220. هل تؤكد؟', '/game/g1'],
    ])
    expect(calls[0]).toEqual({ fn: 'claim_notifications', args: { p_limit: 100 } })
    expect(finishCalls(calls)[0]?.args).toEqual({
      p_results: [
        { id: 'r1', status: 'sent', error: null },
        { id: 'r2', status: 'skipped', error: null },
        { id: 'r3', status: 'sent', error: null },
      ],
      p_dead_tokens: ['dead'],
    })
    expect(summary).toEqual({ batches: 1, claimed: 3, sent: 2, skipped: 1, failed: 0, requeued: 0, deadTokens: 1 })
  })

  it('stops claiming once the queue is empty', async () => {
    const { client, calls } = fakeDb([])
    const summary = await dispatchQueue(client, { fetchFn: fakeFetch(allOk).fetchFn, expoAccessToken: null })
    expect(calls.map((c) => c.fn)).toEqual(['claim_notifications'])
    expect(summary.batches).toBe(0)
  })

  it('keeps claiming full batches up to the cap', async () => {
    const full = (p: string): unknown[] => [row(`${p}1`, ['a']), row(`${p}2`, ['b'])]
    const { client, calls } = fakeDb([full('x'), full('y'), full('z'), full('w')])
    const summary = await dispatchQueue(client, { fetchFn: fakeFetch(allOk).fetchFn, expoAccessToken: null, claimLimit: 2, maxBatches: 3 })
    expect(finishCalls(calls)).toHaveLength(3)
    expect(summary).toMatchObject({ batches: 3, claimed: 6, sent: 6 })
  })

  it('re-queues transient failures when attempts are known, then stops for this run', async () => {
    const { client, calls } = fakeDb([[row('r1', ['a'], { attempts: 1 }), row('r2', ['b'])], [row('r3', ['c'])]])
    const expo = fakeFetch(() => new Response('', { status: 502 }))
    const summary = await dispatchQueue(client, { fetchFn: expo.fetchFn, expoAccessToken: null, claimLimit: 2 })
    expect(finishCalls(calls)).toHaveLength(1)
    expect(finishCalls(calls)[0]?.args?.['p_results']).toEqual([
      { id: 'r1', status: 'queued', error: 'expo http 502' },
      // claim_notifications does not return attempts yet: never re-queue blindly.
      { id: 'r2', status: 'failed', error: 'expo http 502' },
    ])
    expect(summary).toMatchObject({ failed: 1, requeued: 1 })
  })

  it('skips rows with unusable tokens and ignores rows without an id', async () => {
    const { client, calls } = fakeDb([[{ id: 'bad', tokens: 'nope' }, 'garbage']])
    await dispatchQueue(client, { fetchFn: fakeFetch(allOk).fetchFn, expoAccessToken: null })
    expect(finishCalls(calls)[0]?.args?.['p_results']).toEqual([{ id: 'bad', status: 'skipped', error: null }])
  })

  it('throws when an RPC fails', async () => {
    const claimFail = fakeDb([], { claim_notifications: { code: '42501', message: 'permission denied' } })
    await expect(dispatchQueue(claimFail.client, { fetchFn: fakeFetch(allOk).fetchFn, expoAccessToken: null })).rejects.toThrow(
      'claim_notifications failed: 42501 permission denied',
    )
    const finishFail = fakeDb([[row('r1', ['a'])]], { finish_notifications: { message: 'oops' } })
    await expect(dispatchQueue(finishFail.client, { fetchFn: fakeFetch(allOk).fetchFn, expoAccessToken: null })).rejects.toThrow(
      'finish_notifications failed: unknown oops',
    )
  })
})
