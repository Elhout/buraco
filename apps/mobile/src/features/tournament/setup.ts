import type { TournamentFormat, TournamentPairing } from './types'

/**
 * Pure model of the "New tournament" form: entrant picking, pairing, seeding, validation and the
 * create_tournament / set_entries payloads. Fixed pairs need an even count (every member paired);
 * rotating partners need a multiple of 4 (ghost seats fill a table). Knockout runs on fixed pairs.
 */

export type Pair = readonly [string, string]

export interface SetupDraft {
  readonly name: string
  /** YYYY-MM-DD */
  readonly startsOn: string
  readonly format: TournamentFormat
  readonly pairing: TournamentPairing
  readonly roundMinutes: string
  readonly target: string
  /** Selected member ids, in pick order. */
  readonly selected: readonly string[]
  /** Fixed pairs in seed order (knockout seeds = this order). */
  readonly pairs: readonly Pair[]
  /** Ghost seat names (rotating only). */
  readonly ghosts: readonly string[]
}

export type SetupError =
  | 'nameRequired'
  | 'nameTooLong'
  | 'dateInvalid'
  | 'minutesInvalid'
  | 'targetInvalid'
  | 'tooFewEntrants'
  | 'tooManyEntrants'
  | 'unpaired'
  | 'notMultipleOfFour'
  | 'knockoutNeedsPairs'

export type SetupWarning = 'roundRobinLarge' | 'swissSize'

export const MIN_MINUTES = 5
export const MAX_MINUTES = 240
export const MAX_NAME = 80
const MIN_ENTRANTS = 4
/** Server limit (hardening migration). */
export const MAX_ENTRANTS = 64
const ROUND_ROBIN_MAX_PAIRS = 6
const SWISS_MIN_PLAYERS = 8
const SWISS_MAX_PLAYERS = 40

export const emptyDraft = (startsOn: string, target: number): SetupDraft => ({
  name: '',
  startsOn,
  format: 'swiss',
  pairing: 'fixed',
  roundMinutes: '45',
  target: String(target),
  selected: [],
  pairs: [],
  ghosts: [],
})

const inPair = (pairs: readonly Pair[], userId: string): boolean => pairs.some((p) => p.includes(userId))

/** Add or remove a member; removing also breaks their pair. */
export function toggleMember(draft: SetupDraft, userId: string): SetupDraft {
  if (!draft.selected.includes(userId)) return { ...draft, selected: [...draft.selected, userId] }
  return { ...draft, selected: draft.selected.filter((u) => u !== userId), pairs: draft.pairs.filter((p) => !p.includes(userId)) }
}

export const unpairedMembers = (draft: SetupDraft): string[] => draft.selected.filter((u) => !inPair(draft.pairs, u))

/**
 * Tap-to-pair: the first tap holds a member (returned as `pending`), the second tap on another
 * unpaired member forms the pair. Tapping the held member again releases it.
 */
export function tapToPair(draft: SetupDraft, pending: string | null, userId: string): { draft: SetupDraft; pending: string | null } {
  if (inPair(draft.pairs, userId) || !draft.selected.includes(userId)) return { draft, pending }
  if (pending === null) return { draft, pending: userId }
  if (pending === userId) return { draft, pending: null }
  return { draft: { ...draft, pairs: [...draft.pairs, [pending, userId] as const] }, pending: null }
}

export const unpair = (draft: SetupDraft, index: number): SetupDraft => ({ ...draft, pairs: draft.pairs.filter((_, i) => i !== index) })

/** Seed order for knockout: move a pair up (-1) or down (+1). Out-of-range moves are ignored. */
export function movePair(draft: SetupDraft, index: number, delta: -1 | 1): SetupDraft {
  const target = index + delta
  if (index < 0 || index >= draft.pairs.length || target < 0 || target >= draft.pairs.length) return draft
  const next = [...draft.pairs]
  next[index] = draft.pairs[target] as Pair
  next[target] = draft.pairs[index] as Pair
  return { ...draft, pairs: next }
}

export const addGhost = (draft: SetupDraft, name: string): SetupDraft => ({ ...draft, ghosts: [...draft.ghosts, name] })
export const removeGhost = (draft: SetupDraft, index: number): SetupDraft => ({
  ...draft,
  ghosts: draft.ghosts.filter((_, i) => i !== index),
})

/** Ghost seats needed to fill the last table in rotating mode. */
export const ghostsNeeded = (draft: SetupDraft): number => (4 - ((draft.selected.length + draft.ghosts.length) % 4)) % 4

export const entrantCount = (draft: SetupDraft): number => draft.selected.length + (draft.pairing === 'rotating' ? draft.ghosts.length : 0)

const toInt = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? Number.parseInt(s, 10) : null)

const isIsoDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function fieldErrors(draft: SetupDraft): SetupError[] {
  const errors: SetupError[] = []
  const name = draft.name.trim()
  if (name === '') errors.push('nameRequired')
  if (name.length > MAX_NAME) errors.push('nameTooLong')
  if (!isIsoDate(draft.startsOn)) errors.push('dateInvalid')
  const minutes = toInt(draft.roundMinutes)
  if (minutes === null || minutes < MIN_MINUTES || minutes > MAX_MINUTES) errors.push('minutesInvalid')
  const target = toInt(draft.target)
  if (target === null || target <= 0) errors.push('targetInvalid')
  return errors
}

function entrantErrors(draft: SetupDraft): SetupError[] {
  const count = entrantCount(draft)
  if (count > MAX_ENTRANTS) return ['tooManyEntrants']
  if (draft.pairing === 'rotating') {
    if (draft.format === 'knockout') return ['knockoutNeedsPairs']
    if (count < MIN_ENTRANTS) return ['tooFewEntrants']
    return count % 4 === 0 ? [] : ['notMultipleOfFour']
  }
  if (count < MIN_ENTRANTS) return ['tooFewEntrants']
  return unpairedMembers(draft).length > 0 ? ['unpaired'] : []
}

export interface SetupCheck {
  readonly errors: readonly SetupError[]
  readonly warnings: readonly SetupWarning[]
}

export function validateDraft(draft: SetupDraft): SetupCheck {
  const errors = [...fieldErrors(draft), ...entrantErrors(draft)]
  const warnings: SetupWarning[] = []
  const players = entrantCount(draft)
  if (draft.format === 'round_robin' && draft.pairing === 'fixed' && players / 2 > ROUND_ROBIN_MAX_PAIRS) warnings.push('roundRobinLarge')
  if (draft.format === 'swiss' && (players < SWISS_MIN_PLAYERS || players > SWISS_MAX_PLAYERS)) warnings.push('swissSize')
  return { errors, warnings }
}

// Plain object types so the payloads are assignable to the RPCs' Json parameters.
export type EntryPayload = { user_id?: string; guest_name?: string; pair?: string; seed: number }

/** set_entries payload. Fixed: both members of pair i share key "p<i>" and seed i. */
export function buildEntries(draft: SetupDraft): EntryPayload[] {
  if (draft.pairing === 'fixed') {
    return draft.pairs.flatMap((pair, i) => pair.map((userId) => ({ user_id: userId, pair: `p${i + 1}`, seed: i + 1 })))
  }
  const members = draft.selected.map((userId, i) => ({ user_id: userId, seed: i + 1 }))
  const ghosts = draft.ghosts.map((name, i) => ({ guest_name: name, seed: members.length + i + 1 }))
  return [...members, ...ghosts]
}

export interface CreateArgs {
  readonly p_club_id: string
  readonly p_name: string
  readonly p_format: TournamentFormat
  readonly p_pairing: TournamentPairing
  readonly p_round_minutes: number
  readonly p_target_score: number
  readonly p_starts_on: string
}

/** create_tournament arguments; call only after validateDraft reports no errors. */
export const buildCreateArgs = (draft: SetupDraft, clubId: string): CreateArgs => ({
  p_club_id: clubId,
  p_name: draft.name.trim(),
  p_format: draft.format,
  p_pairing: draft.pairing,
  p_round_minutes: Number.parseInt(draft.roundMinutes, 10),
  p_target_score: Number.parseInt(draft.target, 10),
  p_starts_on: draft.startsOn,
})

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
