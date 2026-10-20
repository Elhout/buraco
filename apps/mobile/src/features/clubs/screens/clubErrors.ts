/**
 * Club-management RPC failures the shared AppError mapping turns into "unknown". Returns a key in
 * the `profile` namespace (`clubErrors.<key>`), or null to use the common text.
 * Pure; tested in clubErrors.test.ts.
 */
export type ClubErrorKey = 'ownerOnly' | 'notAllowed' | 'memberGone' | 'nameInvalid'

const RULES: readonly (readonly [RegExp, ClubErrorKey])[] = [
  [/only the club owner/i, 'ownerOnly'],
  [/not allowed to remove|row-level security|permission denied/i, 'notAllowed'],
  [/member not found|new owner must be a club member/i, 'memberGone'],
  [/clubs_name_check|char_length\(name\)/i, 'nameInvalid'],
]

export function clubErrorKey(error: unknown): ClubErrorKey | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '')
  return RULES.find(([pattern]) => pattern.test(message))?.[1] ?? null
}
