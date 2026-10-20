// Account rules for manage-accounts. Pure: no Deno APIs, so it can be unit-tested.
// The first block is a copy of packages/shared/src/accounts.ts (Deno cannot import that package);
// packages/db-tests/src/accounts-parity.test.ts keeps them identical.

export const LOGIN_DOMAIN = 'users.buraco.app'
export const USERNAME_MIN = 3
export const USERNAME_MAX = 24
export const PASSWORD_MIN = 8
/** bcrypt, which Supabase Auth uses, ignores bytes after 72. */
export const PASSWORD_MAX = 72

const USERNAME_RE = new RegExp(`^[a-z0-9][a-z0-9._-]{${USERNAME_MIN - 1},${USERNAME_MAX - 1}}$`)

/** Usernames are case-insensitive: trimmed and lower-cased before any check or lookup. */
export const normalizeUsername = (input: string): string => input.trim().toLowerCase()

export type UsernameProblem = 'empty' | 'length' | 'chars'

export function validateUsername(input: string): { ok: true; username: string } | { ok: false; problem: UsernameProblem } {
  const username = normalizeUsername(input)
  if (username.length === 0) return { ok: false, problem: 'empty' }
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return { ok: false, problem: 'length' }
  if (!USERNAME_RE.test(username)) return { ok: false, problem: 'chars' }
  return { ok: true, username }
}

export type PasswordProblem = 'short' | 'long'

export function validatePassword(password: string): { ok: true } | { ok: false; problem: PasswordProblem } {
  if (password.length < PASSWORD_MIN) return { ok: false, problem: 'short' }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return { ok: false, problem: 'long' }
  return { ok: true }
}

export const loginEmail = (username: string): string => `${normalizeUsername(username)}@${LOGIN_DOMAIN}`

// ---------------------------------------------------------------- request parsing

/** profiles.display_name limit (DB check constraint). */
export const NAME_MAX = 40

export type AccountRequest =
  | { action: 'create'; clubId: string; username: string; password: string; displayName: string }
  | { action: 'set_password'; clubId: string; userId: string; password: string }

export type RequestError = 'invalid_request' | 'invalid_username' | 'weak_password' | 'invalid_name'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (body: Record<string, unknown>, key: string): string | null => {
  const v = body[key]
  return typeof v === 'string' ? v : null
}

const uuid = (body: Record<string, unknown>, key: string): string | null => {
  const v = str(body, key)
  return v !== null && UUID_RE.test(v) ? v.toLowerCase() : null
}

/** Validates a manage-accounts body. Never trusts it: the caller comes from the JWT, not the body. */
export function parseAccountRequest(body: unknown): { ok: true; request: AccountRequest } | { ok: false; error: RequestError } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'invalid_request' }
  const b = body as Record<string, unknown>
  const clubId = uuid(b, 'club_id')
  const password = str(b, 'password')
  if (clubId === null || password === null) return { ok: false, error: 'invalid_request' }

  if (b.action === 'set_password') {
    const userId = uuid(b, 'user_id')
    if (userId === null) return { ok: false, error: 'invalid_request' }
    if (!validatePassword(password).ok) return { ok: false, error: 'weak_password' }
    return { ok: true, request: { action: 'set_password', clubId, userId, password } }
  }

  if (b.action === 'create') {
    const rawUsername = str(b, 'username')
    const rawName = str(b, 'display_name')
    if (rawUsername === null || rawName === null) return { ok: false, error: 'invalid_request' }
    const username = validateUsername(rawUsername)
    if (!username.ok) return { ok: false, error: 'invalid_username' }
    if (!validatePassword(password).ok) return { ok: false, error: 'weak_password' }
    const displayName = rawName.trim().replace(/\s+/g, ' ')
    if (displayName.length === 0 || [...displayName].length > NAME_MAX) return { ok: false, error: 'invalid_name' }
    return { ok: true, request: { action: 'create', clubId, username: username.username, password, displayName } }
  }

  return { ok: false, error: 'invalid_request' }
}
