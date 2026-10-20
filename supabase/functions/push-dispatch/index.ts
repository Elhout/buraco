// push-dispatch: sends queued pushes (notification_queue) through Expo, and Web Push for web-app devices.
// Called by the AFTER INSERT trigger on notification_queue (via pg_net) and by game-cron.
// Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY | CRON_SECRET>`.

import { dispatchQueue } from '../_shared/dispatch.ts'
import { json } from '../_shared/auth.ts'
import { webPushSenderFromEnv } from '../_shared/webpush-sender.ts'
import { errorMessage, readEnv, rejectUnauthorized, serviceClient, type ServiceEnv } from '../_shared/service.ts'

const handle = async (req: Request, env: ServiceEnv): Promise<Response> => {
  const denied = rejectUnauthorized(req, env)
  if (denied) return denied
  const summary = await dispatchQueue(serviceClient(env), {
    fetchFn: fetch,
    expoAccessToken: env.expoAccessToken,
    webPush: webPushSenderFromEnv(fetch, env.vapid),
  })
  return json({ ok: true, ...summary })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req, readEnv())
  } catch (e: unknown) {
    console.error(JSON.stringify({ fn: 'push-dispatch', error: errorMessage(e) }))
    return json({ ok: false, error: 'dispatch failed' }, 500)
  }
})
