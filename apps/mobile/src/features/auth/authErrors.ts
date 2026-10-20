/**
 * Supabase Auth (GoTrue) and account-management failures the shared AppError mapping doesn't
 * know. Returns a key in the `auth` namespace (`errors.<key>`), or null to fall back to the
 * common error text. Pure; tested in authErrors.test.ts.
 */
export type AuthErrorKey =
  'wrongPassword' | 'rateLimited' | 'providerDisabled' | 'tooManyCodes' | 'usernameTaken' | 'forbidden' | 'samePassword' | 'weakPassword'

const CODE_RULES: Readonly<Record<string, AuthErrorKey>> = {
  invalid_credentials: 'wrongPassword',
  over_request_rate_limit: 'rateLimited',
  email_provider_disabled: 'providerDisabled',
  provider_disabled: 'providerDisabled',
  // manage-accounts Edge Function
  username_taken: 'usernameTaken',
  forbidden: 'forbidden',
  same_password: 'samePassword',
  weak_password: 'weakPassword',
}

const MESSAGE_RULES: readonly (readonly [RegExp, AuthErrorKey])[] = [
  // join_club throttling (hardening migration): 10 wrong invite codes per hour.
  [/too many invite code attempts/i, 'tooManyCodes'],
  [/invalid login credentials/i, 'wrongPassword'],
  [/rate limit|too many requests/i, 'rateLimited'],
  [/provider is not enabled|logins are disabled/i, 'providerDisabled'],
]

const field = (error: unknown, key: string): string | null => {
  if (typeof error !== 'object' || error === null || !(key in error)) return null
  const v = (error as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : null
}

export function authErrorKey(error: unknown): AuthErrorKey | null {
  const code = field(error, 'code')
  if (code && CODE_RULES[code]) return CODE_RULES[code]
  const message = field(error, 'message') ?? (typeof error === 'string' ? error : '')
  return MESSAGE_RULES.find(([pattern]) => pattern.test(message))?.[1] ?? null
}
