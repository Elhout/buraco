/**
 * Username + password accounts. Supabase Auth only knows emails, so a username is stored as the
 * synthetic address `<username>@LOGIN_DOMAIN`. No email is ever sent to it (confirmations are off
 * and self sign-up is disabled); club owners and admins create accounts and reset passwords.
 *
 * Mirrored in supabase/functions/_shared/accounts.ts (Deno cannot import this package);
 * packages/db-tests/src/accounts-parity.test.ts keeps the two identical.
 */

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

/** The username behind a login email, or null for any other address. */
export function usernameFromEmail(email: string | null | undefined): string | null {
  const suffix = `@${LOGIN_DOMAIN}`
  if (!email || !email.toLowerCase().endsWith(suffix)) return null
  return email.slice(0, -suffix.length).toLowerCase()
}
