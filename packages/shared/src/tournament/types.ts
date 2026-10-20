/**
 * Shared types for the tournament engine. Ids are opaque strings.
 * A "unit" is the ranked entity: a pair id in fixed-pairs mode, a player id in rotating mode.
 * See docs/SPEC.md "Tournament mode".
 */

/** One match. In fixed-pairs mode each side is `[pairId]`; in rotating mode each side is two player ids. */
export interface Match {
  readonly teamA: readonly string[]
  readonly teamB: readonly string[]
}

/** The matches of one round plus units that sit out (bye). */
export interface RoundPlan {
  readonly matches: readonly Match[]
  readonly byes: readonly string[]
}

export type MatchResult = 'a' | 'b' | 'draw' | null

/** A match that has been scheduled and possibly finished. `result: null` means not finished. */
export interface PlayedMatch extends Match {
  readonly result: MatchResult
  readonly pointsA: number
  readonly pointsB: number
}

export interface Standing {
  readonly unit: string
  readonly rank: number
  readonly played: number
  readonly wins: number
  readonly draws: number
  readonly losses: number
  readonly matchPoints: number
  readonly differential: number
  readonly pointsFor: number
  readonly pointsAgainst: number
}
