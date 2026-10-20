// Deno-only: encrypts Web Push messages with VAPID (npm:web-push) and posts them with fetch.
// generateRequestDetails does the RFC 8291 encryption and the VAPID JWT without any network I/O;
// sending through the given fetch keeps Node's https module out of the Edge runtime.

// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7'
import type { FetchFn } from '../push-dispatch/expo.ts'
import { WEB_PUSH_TTL_SECONDS, type WebPushSender, webFailure, webOutcome } from './webpush.ts'

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** fetch wants string headers; web-push gives numbers for some and a Content-Length fetch sets itself. */
const toHeaders = (headers: Record<string, string | number>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers)
      .filter(([k]) => k.toLowerCase() !== 'content-length')
      .map(([k, v]) => [k, String(v)]),
  )

export const createWebPushSender =
  (fetchFn: FetchFn, vapid: VapidConfig): WebPushSender =>
  async (sub, payload) => {
    let details: webpush.RequestDetails
    try {
      details = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        vapidDetails: vapid,
        TTL: WEB_PUSH_TTL_SECONDS,
        urgency: 'high',
      })
    } catch (e: unknown) {
      // A malformed subscription or VAPID key: retrying will not help.
      return webFailure(`web push encrypt failed: ${errorText(e)}`, false)
    }
    try {
      const res = await fetchFn(details.endpoint, {
        method: details.method,
        headers: toHeaders(details.headers),
        body: details.body ? new Uint8Array(details.body) : null,
      })
      return webOutcome(res.status)
    } catch (e: unknown) {
      return webFailure(`web push network error: ${errorText(e)}`, true)
    }
  }

let warned = false

/** The sender, or null (logged once per instance) when the VAPID secrets are not set. */
export const webPushSenderFromEnv = (fetchFn: FetchFn, vapid: VapidConfig | null): WebPushSender | null => {
  if (vapid) return createWebPushSender(fetchFn, vapid)
  if (!warned) {
    warned = true
    console.warn(JSON.stringify({ webPush: 'disabled: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT' }))
  }
  return null
}
