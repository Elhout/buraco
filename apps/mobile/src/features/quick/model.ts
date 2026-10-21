import {
  DEFAULT_CONFIG,
  type GameOutcome,
  type RoundScoreError,
  type ScoringConfig,
  type Team,
  type Totals,
  gameOutcome,
  validateRoundScore,
} from '@buraco/shared'

/**
 * Quick game: a score calculator with no sign-in, kept only on this phone (never in club history
 * or stats). Same end rule as club games (`gameOutcome`): the game ends when a team reaches the
 * target at the end of a round, the higher total wins, and a tie at the target continues.
 * Pure; tested in model.test.ts.
 */

export interface QuickRound {
  readonly a: number
  readonly b: number
  /** The team that made the exact cut this round (+QUICK_CUT_BONUS), if any. */
  readonly cut?: Team
  /** Just the +100 from the button under a team's score: not a dealt round, no round number. */
  readonly bonusOnly?: boolean
}

export interface QuickGame {
  /** Empty means "Team A" / "Team B" (names are optional). */
  readonly teamAName: string
  readonly teamBName: string
  readonly target: number
  readonly rounds: readonly QuickRound[]
}

/** The exact-cut bonus, added on top of the round points by the small +100 button. */
export const QUICK_CUT_BONUS = 100

/** A team's points for one round, including its exact-cut bonus. */
export const roundPoints = (round: QuickRound, team: Team): number =>
  (team === 'A' ? round.a : round.b) + (round.cut === team ? QUICK_CUT_BONUS : 0)

export const TARGET_PRESETS = [1500, 2000, 3000] as const
export const TARGET_MIN = 100
export const TARGET_MAX = 50_000
export const TEAM_NAME_MAX = 24

export const newQuickGame = (previous?: Pick<QuickGame, 'teamAName' | 'teamBName' | 'target'>): QuickGame => ({
  teamAName: previous?.teamAName ?? '',
  teamBName: previous?.teamBName ?? '',
  target: previous?.target ?? DEFAULT_CONFIG.targetScore,
  rounds: [],
})

/** Negative rounds are always allowed here; there is no exact-cut line (add it to the round). */
export const quickConfig = (game: QuickGame): ScoringConfig => ({ targetScore: game.target, cutBonus: 0, allowNegative: true })

export function quickTotals(game: QuickGame): Totals {
  return game.rounds.reduce<Totals>((acc, r) => ({ A: acc.A + roundPoints(r, 'A'), B: acc.B + roundPoints(r, 'B') }), { A: 0, B: 0 })
}

export const quickOutcome = (game: QuickGame): GameOutcome => gameOutcome(quickTotals(game), quickConfig(game))

export const isOver = (game: QuickGame): boolean => quickOutcome(game).kind === 'won'

export interface RoundRow {
  /** 1-based round number (bonus-only rows repeat the previous round's number). */
  readonly n: number
  /** A +100 exact cut added from the score card, not a round. */
  readonly bonus: boolean
  readonly index: number
  readonly round: QuickRound
  /** Running totals after this round. */
  readonly totals: Totals
}

/** Who is ahead on these totals and by how much; null when level. */
export interface Lead {
  readonly team: Team | null
  readonly margin: number
}

export function leadOf(totals: Totals): Lead {
  const margin = Math.abs(totals.A - totals.B)
  return { team: margin === 0 ? null : totals.A > totals.B ? 'A' : 'B', margin }
}

/** Rounds with running totals, newest first (as listed on screen). */
export function roundRows(game: QuickGame): RoundRow[] {
  let acc: Totals = { A: 0, B: 0 }
  let n = 0
  const rows = game.rounds.map((round, index) => {
    if (!round.bonusOnly) n += 1
    acc = { A: acc.A + roundPoints(round, 'A'), B: acc.B + roundPoints(round, 'B') }
    return { n: Math.max(n, 1), bonus: round.bonusOnly === true, index, round, totals: acc }
  })
  return rows.reverse()
}

export type QuickError = RoundScoreError | 'game_over' | 'no_round'
export type QuickResult = { readonly ok: true; readonly game: QuickGame } | { readonly ok: false; readonly error: QuickError }

function checkRound(game: QuickGame, a: number, b: number): RoundScoreError | null {
  for (const score of [a, b]) {
    const v = validateRoundScore(score, quickConfig(game))
    if (!v.ok) return v.error
  }
  return null
}

const makeRound = (a: number, b: number, cut: Team | null): QuickRound => (cut ? { a, b, cut } : { a, b })

export function addRound(game: QuickGame, a: number, b: number, cut: Team | null = null): QuickResult {
  if (isOver(game)) return { ok: false, error: 'game_over' }
  const error = checkRound(game, a, b)
  if (error) return { ok: false, error }
  return { ok: true, game: { ...game, rounds: [...game.rounds, makeRound(a, b, cut)] } }
}

/** Fixes a typo in any round. Totals and the outcome follow from the rounds, so they update too. */
export function editRound(game: QuickGame, index: number, a: number, b: number, cut: Team | null = null): QuickResult {
  if (!Number.isInteger(index) || index < 0 || index >= game.rounds.length) return { ok: false, error: 'no_round' }
  const error = checkRound(game, a, b)
  if (error) return { ok: false, error }
  return { ok: true, game: { ...game, rounds: game.rounds.map((r, i) => (i === index ? makeRound(a, b, cut) : r)) } }
}

/** The +100 button under a team's score: adds the exact-cut bonus now, without a round. */
export function addCutBonus(game: QuickGame, team: Team): QuickResult {
  if (isOver(game)) return { ok: false, error: 'game_over' }
  return { ok: true, game: { ...game, rounds: [...game.rounds, { a: 0, b: 0, cut: team, bonusOnly: true }] } }
}

/** Removes one entry (e.g. a +100 tapped by mistake). */
export function removeRound(game: QuickGame, index: number): QuickGame {
  return { ...game, rounds: game.rounds.filter((_, i) => i !== index) }
}

export const undoLastRound = (game: QuickGame): QuickGame => ({ ...game, rounds: game.rounds.slice(0, -1) })

/** Trimmed, single spaces, at most TEAM_NAME_MAX characters. Empty clears it back to the default. */
export const cleanTeamName = (input: string): string => [...input.trim().replace(/\s+/g, ' ')].slice(0, TEAM_NAME_MAX).join('')

export const renameTeam = (game: QuickGame, team: Team, name: string): QuickGame =>
  team === 'A' ? { ...game, teamAName: cleanTeamName(name) } : { ...game, teamBName: cleanTeamName(name) }

export const teamName = (game: QuickGame, team: Team): string => (team === 'A' ? game.teamAName : game.teamBName)

export const isValidTarget = (target: number): boolean => Number.isInteger(target) && target >= TARGET_MIN && target <= TARGET_MAX

export const setTarget = (game: QuickGame, target: number): QuickGame => (isValidTarget(target) ? { ...game, target } : game)

const isRound = (v: unknown): v is QuickRound => {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    Number.isInteger(r.a) &&
    Number.isInteger(r.b) &&
    (r.cut === undefined || r.cut === 'A' || r.cut === 'B') &&
    (r.bonusOnly === undefined || typeof r.bonusOnly === 'boolean')
  )
}

/** Reads a saved game back; anything malformed (old format, edited storage) starts fresh. */
export function parseQuickGame(raw: string | null): QuickGame | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const g = v as Record<string, unknown>
    if (typeof g.target !== 'number' || !isValidTarget(g.target)) return null
    if (!Array.isArray(g.rounds) || !g.rounds.every(isRound)) return null
    const name = (x: unknown): string => (typeof x === 'string' ? cleanTeamName(x) : '')
    const base: QuickGame = { teamAName: name(g.teamAName), teamBName: name(g.teamBName), target: g.target, rounds: [] }
    return g.rounds.every((r: QuickRound) => checkRound(base, r.a, r.b) === null) ? { ...base, rounds: g.rounds as QuickRound[] } : null
  } catch {
    return null
  }
}
