/**
 * Pure Buraco scoring helpers. The client uses these for previews only;
 * the authoritative result is computed by Postgres (`confirm_round`), which
 * must implement the same rules. See docs/SPEC.md "House rules and scoring logic".
 */

export type Team = 'A' | 'B'
export type RoundStatus = 'pending' | 'confirmed' | 'voided'

/** Frozen per game in `games.config_snapshot`. */
export interface ScoringConfig {
  readonly targetScore: number
  readonly cutBonus: number
  readonly allowNegative: boolean
}

export const DEFAULT_CONFIG: ScoringConfig = Object.freeze({
  targetScore: 2000,
  cutBonus: 100,
  allowNegative: true,
})

/** A bonus line (exact cut) already resolved from seat to team. */
export interface BonusLine {
  readonly team: Team
  readonly points: number
}

export interface ScoredRound {
  readonly teamAScore: number
  readonly teamBScore: number
  readonly status: RoundStatus
  readonly lines: readonly BonusLine[]
}

export interface Totals {
  readonly A: number
  readonly B: number
}

export type GameOutcome =
  { readonly kind: 'in_progress' } | { readonly kind: 'tie_at_target' } | { readonly kind: 'won'; readonly winner: Team }

/** Upper bound on a single round entry; guards against typos like an extra zero or two. */
export const MAX_ROUND_ABS = 99_999

export type RoundScoreError = 'not_integer' | 'negative_not_allowed' | 'out_of_range'
export type RoundScoreValidation = { readonly ok: true } | { readonly ok: false; readonly error: RoundScoreError }

/** team_total = Σ (round_score + bonus lines), confirmed rounds only. */
export function totals(rounds: readonly ScoredRound[]): Totals {
  return rounds
    .filter((r) => r.status === 'confirmed')
    .reduce<Totals>(
      (acc, r) => {
        const bonus = (team: Team): number => r.lines.filter((l) => l.team === team).reduce((sum, l) => sum + l.points, 0)
        return {
          A: acc.A + r.teamAScore + bonus('A'),
          B: acc.B + r.teamBScore + bonus('B'),
        }
      },
      { A: 0, B: 0 },
    )
}

export function gameOutcome(t: Totals, config: ScoringConfig): GameOutcome {
  const anyAtTarget = t.A >= config.targetScore || t.B >= config.targetScore
  if (!anyAtTarget) return { kind: 'in_progress' }
  if (t.A === t.B) return { kind: 'tie_at_target' }
  return { kind: 'won', winner: t.A > t.B ? 'A' : 'B' }
}

export function winner(t: Totals, config: ScoringConfig): Team | null {
  const outcome = gameOutcome(t, config)
  return outcome.kind === 'won' ? outcome.winner : null
}

export function isFinished(t: Totals, config: ScoringConfig): boolean {
  return gameOutcome(t, config).kind === 'won'
}

export function pointsToGo(total: number, config: ScoringConfig): number {
  return Math.max(0, config.targetScore - total)
}

export function validateRoundScore(score: number, config: ScoringConfig): RoundScoreValidation {
  if (!Number.isInteger(score)) return { ok: false, error: 'not_integer' }
  if (Math.abs(score) > MAX_ROUND_ABS) return { ok: false, error: 'out_of_range' }
  if (score < 0 && !config.allowNegative) return { ok: false, error: 'negative_not_allowed' }
  return { ok: true }
}
