// Deno-only glue shared by the internal functions: env, auth gate, service-role client.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { isAuthorized, json } from './auth.ts'
import type { RpcClient } from './dispatch.ts'
import type { VapidConfig } from './webpush-sender.ts'

export interface ServiceEnv {
  supabaseUrl: string
  serviceRoleKey: string
  cronSecret: string | null
  expoAccessToken: string | null
  /** Web Push (web-app devices); null unless all three VAPID_* secrets are set. */
  vapid: VapidConfig | null
}

const optional = (name: string): string | null => {
  const v = Deno.env.get(name)
  return v && v.trim() !== '' ? v.trim() : null
}

const required = (name: string): string => {
  const v = optional(name)
  if (v === null) throw new Error(`missing env ${name}`)
  return v
}

const readVapid = (): VapidConfig | null => {
  const publicKey = optional('VAPID_PUBLIC_KEY')
  const privateKey = optional('VAPID_PRIVATE_KEY')
  const subject = optional('VAPID_SUBJECT')
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

export const readEnv = (): ServiceEnv => ({
  supabaseUrl: required('SUPABASE_URL'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: optional('CRON_SECRET'),
  expoAccessToken: optional('EXPO_ACCESS_TOKEN'),
  vapid: readVapid(),
})

/** 401 response unless the request carries the service-role key or the cron secret. */
export const rejectUnauthorized = (req: Request, env: ServiceEnv): Response | null =>
  isAuthorized(req.headers.get('Authorization'), [env.serviceRoleKey, env.cronSecret])
    ? null
    : json({ ok: false, error: 'unauthorized' }, 401)

export const serviceClient = (env: ServiceEnv): RpcClient =>
  createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
