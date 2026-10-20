// manage-accounts: club owners and admins create username+password accounts and reset passwords
// (there is no self sign-up). The caller's JWT identifies them; the permission check is the SQL
// function assert_account_admin, so the rules live (and are tested) in one place.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { type AccountRequest, loginEmail, parseAccountRequest } from '../_shared/accounts.ts'
import { json } from '../_shared/auth.ts'
import { preflight, withCors } from '../_shared/cors.ts'
import { errorMessage, readEnv, type ServiceEnv } from '../_shared/service.ts'

const bearer = (req: Request): string | null => {
  const header = req.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
}

/** False when assert_account_admin refused; other database failures throw. */
const allowed = async (admin: SupabaseClient, caller: string, clubId: string, target: string | null): Promise<boolean> => {
  const { error } = await admin.rpc('assert_account_admin', { p_caller: caller, p_club_id: clubId, p_target: target })
  if (!error) return true
  if (/not allowed to manage this account/.test(error.message)) return false
  throw new Error(`assert_account_admin failed: ${error.message}`)
}

const isTaken = (error: { code?: string; message: string }): boolean =>
  error.code === 'email_exists' || error.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(error.message)

const create = async (admin: SupabaseClient, caller: string, req: Extract<AccountRequest, { action: 'create' }>): Promise<Response> => {
  if (!(await allowed(admin, caller, req.clubId, null))) return json({ ok: false, error: 'forbidden' }, 403)
  const created = await admin.auth.admin.createUser({
    email: loginEmail(req.username),
    password: req.password,
    email_confirm: true,
    user_metadata: { display_name: req.displayName },
  })
  if (created.error) {
    if (isTaken(created.error)) return json({ ok: false, error: 'username_taken' }, 409)
    throw new Error(`create user failed: ${created.error.message}`)
  }
  const userId = created.data.user.id
  const added = await admin.rpc('add_account_to_club', { p_caller: caller, p_club_id: req.clubId, p_user: userId })
  if (added.error) {
    // Don't leave an account behind that nobody can see or manage.
    await admin.auth.admin.deleteUser(userId)
    throw new Error(`add to club failed: ${added.error.message}`)
  }
  return json({ ok: true, user_id: userId })
}

const setPassword = async (
  admin: SupabaseClient,
  caller: string,
  req: Extract<AccountRequest, { action: 'set_password' }>,
): Promise<Response> => {
  if (!(await allowed(admin, caller, req.clubId, req.userId))) return json({ ok: false, error: 'forbidden' }, 403)
  const updated = await admin.auth.admin.updateUserById(req.userId, { password: req.password })
  if (updated.error) throw new Error(`set password failed: ${updated.error.message}`)
  return json({ ok: true })
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

  const body: unknown = await req.json().catch(() => null)
  const parsed = parseAccountRequest(body)
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400)
  const request = parsed.request
  return request.action === 'create' ? await create(admin, data.user.id, request) : await setPassword(admin, data.user.id, request)
}

// Called from the app, including the web build in a browser: answer preflights, add CORS headers.
Deno.serve(async (req: Request): Promise<Response> => {
  const early = preflight(req)
  if (early) return early
  try {
    return withCors(await handle(req, readEnv()))
  } catch (e: unknown) {
    console.error(JSON.stringify({ fn: 'manage-accounts', error: errorMessage(e) }))
    return withCors(json({ ok: false, error: 'failed' }, 500))
  }
})
