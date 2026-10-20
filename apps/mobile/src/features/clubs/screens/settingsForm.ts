import { digitsOnly } from '../../../lib/digits'

/**
 * Club settings form (owner/admin). Only these columns are granted to clients:
 * name, target_score, cut_bonus, allow_negative, season_start. Pure; tested in settingsForm.test.ts.
 */
export interface ClubDraft {
  readonly name: string
  readonly target: string
  readonly cutBonus: string
  readonly allowNegative: boolean
  /** YYYY-MM-DD or empty for no season. */
  readonly seasonStart: string
}

export interface ClubUpdate {
  readonly name: string
  readonly target_score: number
  readonly cut_bonus: number
  readonly allow_negative: boolean
  readonly season_start: string | null
}

export type NameProblem = 'required' | 'tooLong'
export interface ClubErrors {
  readonly name?: NameProblem
  readonly target?: 'range'
  readonly cutBonus?: 'range'
  readonly seasonStart?: 'date'
}
export type ClubValidation = { ok: true; value: ClubUpdate } | { ok: false; errors: ClubErrors }

export const CLUB_NAME_MAX = 60
export const TARGET_RANGE = { min: 100, max: 10_000 } as const
export const CUT_BONUS_RANGE = { min: 0, max: 1_000 } as const

export interface ClubRow {
  readonly name: string
  readonly target_score: number
  readonly cut_bonus: number
  readonly allow_negative: boolean
  readonly season_start: string | null
}

export const draftFromClub = (club: ClubRow): ClubDraft => ({
  name: club.name,
  target: String(club.target_score),
  cutBonus: String(club.cut_bonus),
  allowNegative: club.allow_negative,
  seasonStart: club.season_start ?? '',
})

/** Whole number within range from a text field (Arabic digits allowed), else null. */
export function parseWholeNumber(input: string, range: { min: number; max: number }): number | null {
  const digits = digitsOnly(input)
  if (digits.length === 0 || digits.length !== input.trim().replace(/[\s,٬]/g, '').length) return null
  const n = Number(digits)
  return Number.isSafeInteger(n) && n >= range.min && n <= range.max ? n : null
}

/** A real calendar date in YYYY-MM-DD, else null. */
export function parseIsoDate(input: string): string | null {
  const s = input.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null
}

export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export function validateClubDraft(d: ClubDraft): ClubValidation {
  const nameProblem = validateClubName(d.name)
  const target = parseWholeNumber(d.target, TARGET_RANGE)
  const cut = parseWholeNumber(d.cutBonus, CUT_BONUS_RANGE)
  const hasSeason = d.seasonStart.trim() !== ''
  const season = hasSeason ? parseIsoDate(d.seasonStart) : null
  if (nameProblem === null && target !== null && cut !== null && (!hasSeason || season !== null)) {
    const value = { name: d.name.trim(), target_score: target, cut_bonus: cut, allow_negative: d.allowNegative, season_start: season }
    return { ok: true, value }
  }
  const errors: ClubErrors = {
    ...(nameProblem ? { name: nameProblem } : {}),
    ...(target === null ? { target: 'range' as const } : {}),
    ...(cut === null ? { cutBonus: 'range' as const } : {}),
    ...(hasSeason && season === null ? { seasonStart: 'date' as const } : {}),
  }
  return { ok: false, errors }
}

export const isDraftDirty = (d: ClubDraft, club: ClubRow): boolean => JSON.stringify(d) !== JSON.stringify(draftFromClub(club))

export function validateClubName(input: string): NameProblem | null {
  const name = input.trim()
  if (name.length === 0) return 'required'
  return [...name].length > CLUB_NAME_MAX ? 'tooLong' : null
}
