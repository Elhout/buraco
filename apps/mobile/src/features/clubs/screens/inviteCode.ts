import { toLatinDigits } from '../../../lib/digits'

/**
 * Club invite codes: 6 characters from a 32-symbol alphabet without I, O, 0 and 1
 * (see generate_invite_code in the phase 1 migration). QR codes carry `buraco://join/<CODE>`.
 * Pure; tested in inviteCode.test.ts.
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_LENGTH = 6
export const INVITE_LINK_PREFIX = 'buraco://join/'

const VALID = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_LENGTH}}$`)
const LINK_PREFIX = /^buraco:\/{2,3}join\//i

/** Trims, strips the link prefix, drops spaces/dashes and uppercases. Does not validate. */
export function normalizeInviteCode(raw: string): string {
  return toLatinDigits(raw)
    .trim()
    .replace(LINK_PREFIX, '')
    .replace(/[?#].*$/, '')
    .replace(/[\s\-/]/g, '')
    .toUpperCase()
}

export const isValidInviteCode = (code: string): boolean => VALID.test(code)

/** Normalized code, or null if what was typed or scanned is not an invite code. */
export function parseInviteCode(raw: string): string | null {
  const code = normalizeInviteCode(raw)
  return isValidInviteCode(code) ? code : null
}

/** Keeps a code field tidy while typing: uppercase, alphabet only, at most 6 characters. */
export function sanitizeCodeInput(raw: string): string {
  return [...normalizeInviteCode(raw)]
    .filter((c) => INVITE_ALPHABET.includes(c))
    .join('')
    .slice(0, INVITE_LENGTH)
}

export const inviteLink = (code: string): string => `${INVITE_LINK_PREFIX}${code}`

/** "ABC DEF" for reading aloud across the table. */
export const spacedCode = (code: string): string => (code.length === INVITE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code)
