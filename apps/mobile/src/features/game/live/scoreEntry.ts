import {
  type GameOutcome,
  MAX_ROUND_ABS,
  type RoundScoreError,
  type ScoringConfig,
  type Team,
  type Totals,
  gameOutcome,
  pointsToGo,
  validateRoundScore,
} from '@buraco/shared'

/**
 * Score entry for one round: two fields (A, B) typed on a shared number pad. Pure state machine;
 * the sheet renders it. Preview only; the database decides the real totals (confirm_round).
 */

export interface FieldState {
  readonly digits: string
  readonly negative: boolean
}

export interface EntryState {
  readonly A: FieldState
  readonly B: FieldState
  readonly focus: Team
}

export type EntryAction =
  | { readonly type: 'digit'; readonly digit: string }
  | { readonly type: 'delete' }
  | { readonly type: 'toggleSign'; readonly side?: Team }
  | { readonly type: 'focus'; readonly side: Team }
  | { readonly type: 'reset' }

/** Enough digits for MAX_ROUND_ABS; more would always be out of range. */
export const MAX_DIGITS = String(MAX_ROUND_ABS).length

const EMPTY_FIELD: FieldState = { digits: '', negative: false }
export const initialEntry: EntryState = { A: EMPTY_FIELD, B: EMPTY_FIELD, focus: 'A' }

const withField = (state: EntryState, side: Team, field: FieldState): EntryState =>
  side === 'A' ? { ...state, A: field } : { ...state, B: field }

function typeDigit(field: FieldState, digit: string): FieldState {
  if (!/^[0-9]$/.test(digit)) return field
  if (field.digits === '0') return { ...field, digits: digit }
  if (field.digits.length >= MAX_DIGITS) return field
  return { ...field, digits: field.digits + digit }
}

/** `allowNegative` comes from the game's frozen config: without it the sign never flips. */
export function entryReducer(state: EntryState, action: EntryAction, allowNegative = true): EntryState {
  switch (action.type) {
    case 'digit':
      return withField(state, state.focus, typeDigit(state[state.focus], action.digit))
    case 'delete': {
      const field = state[state.focus]
      return withField(state, state.focus, { ...field, digits: field.digits.slice(0, -1) })
    }
    case 'toggleSign': {
      if (!allowNegative) return state
      const side = action.side ?? state.focus
      return withField(state, side, { ...state[side], negative: !state[side].negative })
    }
    case 'focus':
      return { ...state, focus: action.side }
    case 'reset':
      return initialEntry
  }
}

/** Parsed value, or null while the field is empty. "−0" is just 0. */
export function fieldValue(field: FieldState): number | null {
  if (field.digits === '') return null
  const n = Number.parseInt(field.digits, 10)
  return field.negative && n !== 0 ? -n : n
}

export type FieldError = RoundScoreError | 'missing'

export interface EntryValidation {
  readonly errors: { readonly A: FieldError | null; readonly B: FieldError | null }
  /** Both values when both are present and valid. */
  readonly values: Totals | null
}

function checkField(field: FieldState, config: ScoringConfig): FieldError | null {
  const value = fieldValue(field)
  if (value === null) return 'missing'
  const result = validateRoundScore(value, config)
  return result.ok ? null : result.error
}

export function validateEntry(state: EntryState, config: ScoringConfig): EntryValidation {
  const errors = { A: checkField(state.A, config), B: checkField(state.B, config) }
  const a = fieldValue(state.A)
  const b = fieldValue(state.B)
  const values = errors.A === null && errors.B === null && a !== null && b !== null ? { A: a, B: b } : null
  return { errors, values }
}

export interface EntryPreview {
  readonly totals: Totals
  readonly toGo: Totals
  readonly outcome: GameOutcome
}

/**
 * Totals if this round were confirmed as typed: current totals + typed scores (empty counts as 0)
 * + the exact-cut bonuses already tapped this deal.
 */
export function previewEntry(current: Totals, state: EntryState, dealBonus: Totals, config: ScoringConfig): EntryPreview {
  const totals = {
    A: current.A + (fieldValue(state.A) ?? 0) + dealBonus.A,
    B: current.B + (fieldValue(state.B) ?? 0) + dealBonus.B,
  }
  return {
    totals,
    toGo: { A: pointsToGo(totals.A, config), B: pointsToGo(totals.B, config) },
    outcome: gameOutcome(totals, config),
  }
}
