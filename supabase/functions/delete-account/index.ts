// delete-account: lets a signed-in user delete their own account from inside the app
// (App Store guideline 5.1.1(v)). The caller's JWT identifies them; nothing in the body is trusted.
// Steps: anonymize_user (keeps past games consistent for others), then delete the auth user.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json } from '../_shared/auth.ts'
import { errorMessage, readEnv, type ServiceEnv } from '../_shared/service.ts'

const bearer = (req: Request): string | null => {
  const header = req.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
}

const handle = async (req: Request, env: ServiceEnv): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  const token = bearer(req)
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json({ ok: false, error: 'unauthorized' }, 401)
  const userId = data.user.id

  const anonymized = await admin.rpc('anonymize_user', { p_user_id: userId })
  if (anonymized.error) throw new Error(`anonymize failed: ${anonymized.error.message}`)
  const deleted = await admin.auth.admin.deleteUser(userId)
  if (deleted.error) throw new Error(`auth delete failed: ${deleted.error.message}`)
  return json({ ok: true })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req, readEnv())
  } catch (e: unknown) {
    console.error(JSON.stringify({ fn: 'delete-account', error: errorMessage(e) }))
    return json({ ok: false, error: 'delete failed' }, 500)
  }
})
