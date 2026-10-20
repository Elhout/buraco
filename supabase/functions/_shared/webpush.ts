// Web Push (the iPhone home-screen web app) helpers. Pure: no Deno or npm imports, so they run in
// the Edge Functions and in vitest alike. The encrypting sender is Deno-only: webpush-sender.ts.

import type { SendOutcome } from '../push-dispatch/expo.ts'

/** A browser push subscription as stored in public.devices (platform 'web'). */
export interface WebSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/** Sends one push to one subscription. Must never throw: failures become outcomes. */
export type WebPushSender = (subscription: WebSubscription, payload: string) => Promise<SendOutcome>

/** Pushes are about live games; an hour-old one is useless. */
export const WEB_PUSH_TTL_SECONDS = 3600

/** What the service worker reads: `{ title, body, url }`, url being the in-app path to open. */
export const webPayload = (title: string, body: string, url: string): string => JSON.stringify({ title, body, url })

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== ''

/** The `web` array of a claimed row; malformed entries and duplicate endpoints are dropped. */
export const parseWebSubscriptions = (raw: unknown): WebSubscription[] => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const subs: WebSubscription[] = []
  for (const item of raw) {
    if (!isRecord(item) || !nonEmpty(item['endpoint']) || !nonEmpty(item['p256dh']) || !nonEmpty(item['auth'])) continue
    if (seen.has(item['endpoint'])) continue
    seen.add(item['endpoint'])
    subs.push({ endpoint: item['endpoint'], p256dh: item['p256dh'], auth: item['auth'] })
  }
  return subs
}

/**
 * Maps the push service's HTTP status (RFC 8030). 404/410: the subscription is gone, delete it.
 * 429 and 5xx: try again later. Anything else (400 bad request, 403 VAPID mismatch, 413 too big)
 * is permanent for this message. The endpoint is never put in the message.
 */
export const webOutcome = (status: number): SendOutcome => {
  if (status >= 200 && status < 300) return { ok: true }
  const gone = status === 404 || status === 410
  return { ok: false, message: `web push http ${status}`, transient: status === 429 || status >= 500, deviceNotRegistered: gone }
}

/** A sender that could not encrypt or reach the push service. */
export const webFailure = (message: string, transient: boolean): SendOutcome => ({
  ok: false,
  message,
  transient,
  deviceNotRegistered: false,
})
