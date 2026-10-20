import { describe, expect, it } from 'vitest'
import { CORS_HEADERS, preflight, withCors } from '../../../supabase/functions/_shared/cors.ts'

describe('CORS for app-called functions', () => {
  it('answers a browser preflight with 204 and the allowed headers', () => {
    const res = preflight(new Request('https://x.supabase.co/functions/v1/manage-accounts', { method: 'OPTIONS' }))
    expect(res?.status).toBe(204)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res?.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    expect(res?.headers.get('Access-Control-Allow-Headers')).toContain('apikey')
  })

  it('lets real requests through to the handler', () => {
    expect(preflight(new Request('https://x.supabase.co/f', { method: 'POST' }))).toBeNull()
  })

  it('adds the headers to a response and keeps its status and body', async () => {
    const res = withCors(new Response(JSON.stringify({ ok: false }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    expect(res.status).toBe(409)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    for (const [k, v] of Object.entries(CORS_HEADERS)) expect(res.headers.get(k)).toBe(v)
    expect(await res.json()).toEqual({ ok: false })
  })
})
