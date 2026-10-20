// game-cron: runs every minute from pg_cron. Warns and expires invites, ticks tournament clocks
// (phase 4, skipped while the RPC does not exist), then drains the push queue.
// Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY | CRON_SECRET>`.

import { DispatchError, dispatchQueue, type RpcClient } from '../_shared/dispatch.ts'
import { webPushSenderFromEnv } from '../_shared/webpush-sender.ts'
import { json } from '../_shared/auth.ts'
import { errorMessage, readEnv, rejectUnauthorized, serviceClient, type ServiceEnv } from '../_shared/service.ts'

// PostgREST: "Could not find the function … in the schema cache".
const FUNCTION_NOT_FOUND = 'PGRST202'

const callRpc = async (client: RpcClient, fn: string): Promise<unknown> => {
  const { data, error } = await client.rpc(fn)
  if (error) throw new DispatchError(fn, error)
  return data
}

/** Like callRpc, but a missing function (not yet migrated) yields null instead of failing. */
const callOptionalRpc = async (client: RpcClient, fn: string): Promise<unknown> => {
  const { data, error } = await client.rpc(fn)
  if (error?.code === FUNCTION_NOT_FOUND) return null
  if (error) throw new DispatchError(fn, error)
  return data
}

const handle = async (req: Request, env: ServiceEnv): Promise<Response> => {
  const denied = rejectUnauthorized(req, env)
  if (denied) return denied
  const client = serviceClient(env)
  const warned = await callRpc(client, 'warn_expiring_invites')
  const expired = await callRpc(client, 'expire_invites')
  const tournamentClock = await callOptionalRpc(client, 'tournament_clock_tick')
  const push = await dispatchQueue(client, {
    fetchFn: fetch,
    expoAccessToken: env.expoAccessToken,
    webPush: webPushSenderFromEnv(fetch, env.vapid),
  })
  return json({ ok: true, warned, expired, tournament_clock: tournamentClock, push })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req, readEnv())
  } catch (e: unknown) {
    console.error(JSON.stringify({ fn: 'game-cron', error: errorMessage(e) }))
    return json({ ok: false, error: 'cron failed' }, 500)
  }
})
