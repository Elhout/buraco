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
}

export interface QuickGame {
  /** Empty means "Team A" / "Team B" (names are optional). */
  readonly teamAName: string
  readonly teamBName: string
  readonly target: number
  readonly rounds: readonly QuickRound[]
}

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
  return game.rounds.reduce<Totals>((acc, r) => ({ A: acc.A + r.a, B: acc.B + r.b }), { A: 0, B: 0 })
}

export const quickOutcome = (game: QuickGame): GameOutcome => gameOutcome(quickTotals(game), quickConfig(game))

export const isOver = (game: QuickGame): boolean => quickOutcome(game).kind === 'won'

export interface RoundRow {
  /** 1-based round number. */
  readonly n: number
  readonly index: number
  readonly round: QuickRound
  /** Running totals after this round. */
  readonly totals: Totals
}

/** Rounds with running totals, newest first (as listed on screen). */
export function roundRows(game: QuickGame): RoundRow[] {
  let acc: Totals = { A: 0, B: 0 }
  const rows = game.rounds.map((round, index) => {
    acc = { A: acc.A + round.a, B: acc.B + round.b }
    return { n: index + 1, index, round, totals: acc }
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

export function addRound(game: QuickGame, a: number, b: number): QuickResult {
  if (isOver(game)) return { ok: false, error: 'game_over' }
  const error = checkRound(game, a, b)
  if (error) return { ok: false, error }
  return { ok: true, game: { ...game, rounds: [...game.rounds, { a, b }] } }
}

/** Fixes a typo in any round. Totals and the outcome follow from the rounds, so they update too. */
export function editRound(game: QuickGame, index: number, a: number, b: number): QuickResult {
  if (!Number.isInteger(index) || index < 0 || index >= game.rounds.length) return { ok: false, error: 'no_round' }
  const error = checkRound(game, a, b)
  if (error) return { ok: false, error }
  return { ok: true, game: { ...game, rounds: game.rounds.map((r, i) => (i === index ? { a, b } : r)) } }
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
  return Number.isInteger(r.a) && Number.isInteger(r.b)
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
