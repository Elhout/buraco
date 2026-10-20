import { type H2HRow, type PairH2HRow, num } from './select'

/** Head-to-head between two players or two fixed pairs. Pure (tested). */

export interface Matchup {
  readonly games: number
  /** Wins for the first side (player 1 / pair 1). */
  readonly winsFirst: number
  readonly winsSecond: number
  readonly draws: number
  /** Point differential from the first side's point of view. */
  readonly pointDiff: number
}

export const EMPTY_MATCHUP: Matchup = { games: 0, winsFirst: 0, winsSecond: 0, draws: 0, pointDiff: 0 }

const matchup = (games: number, winsFirst: number, winsSecond: number, pointDiff: number): Matchup => ({
  games,
  winsFirst,
  winsSecond,
  draws: Math.max(0, games - winsFirst - winsSecond),
  pointDiff,
})

/** v_h2h row with user_id = first, opponent_id = second. */
export function playerMatchup(row: H2HRow | null): Matchup {
  if (!row) return EMPTY_MATCHUP
  return matchup(num(row.games), num(row.wins), num(row.losses), num(row.point_diff))
}

export type PairIds = readonly [string, string]

/** v_pair_h2h stores each pair as (least, greatest). */
export const normalizePair = (x: string, y: string): PairIds => (x < y ? [x, y] : [y, x])

export const pairsOverlap = (p: PairIds, q: PairIds): boolean => p.some((id) => q.includes(id))

/** PostgREST `.or()` filter matching both orientations of the two (normalized) pairs. */
export function pairH2HFilter(first: PairIds, second: PairIds): string {
  const side = (a: PairIds, b: PairIds): string => `and(pair_a1.eq.${a[0]},pair_a2.eq.${a[1]},pair_b1.eq.${b[0]},pair_b2.eq.${b[1]})`
  return `${side(first, second)},${side(second, first)}`
}

const isSide = (r: PairH2HRow, a: PairIds, b: PairIds): boolean =>
  r.pair_a1 === a[0] && r.pair_a2 === a[1] && r.pair_b1 === b[0] && r.pair_b2 === b[1]

/**
 * Each game appears once per orientation; prefer the first pair's row and fall back to the
 * mirrored row (wins and losses swapped, differential negated).
 */
export function pairMatchup(rows: readonly PairH2HRow[], first: PairIds, second: PairIds): Matchup {
  const direct = rows.find((r) => isSide(r, first, second))
  if (direct) return matchup(num(direct.games), num(direct.wins), num(direct.losses), num(direct.point_diff))
  const mirrored = rows.find((r) => isSide(r, second, first))
  if (mirrored) return matchup(num(mirrored.games), num(mirrored.losses), num(mirrored.wins), -num(mirrored.point_diff))
  return EMPTY_MATCHUP
}

/** Share of decided games won by the first side (0..1), or null with no decided games. */
export function firstShare(m: Matchup): number | null {
  const decided = m.winsFirst + m.winsSecond
  return decided === 0 ? null : m.winsFirst / decided
}
