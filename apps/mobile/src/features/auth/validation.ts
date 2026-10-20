/** Form rules for auth and profile screens. Pure; tested in validation.test.ts. */

export const NAME_MAX = 40

export type NameProblem = 'empty' | 'tooLong'

/** profiles.display_name: 1–40 characters after trimming (DB check constraint). */
export function validateDisplayName(input: string): { ok: true; name: string } | { ok: false; problem: NameProblem } {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length === 0) return { ok: false, problem: 'empty' }
  if ([...name].length > NAME_MAX) return { ok: false, problem: 'tooLong' }
  return { ok: true, name }
}

/** The placeholder name the sign-up trigger gives every new account. */
export const PLACEHOLDER_NAME = 'Player'

const metaString = (meta: Readonly<Record<string, unknown>> | undefined, key: string): string | null => {
  const v = meta?.[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/**
 * Name to prefill on profile setup: the name the club admin typed when creating the account
 * (user_metadata.display_name), else the profile's name unless it is still the placeholder.
 */
export function prefillName(meta: Readonly<Record<string, unknown>> | undefined, profileName: string | null | undefined): string {
  const fromMeta = metaString(meta, 'display_name')
  if (fromMeta) return fromMeta.slice(0, NAME_MAX)
  const name = profileName?.trim() ?? ''
  return name === PLACEHOLDER_NAME ? '' : name
}
