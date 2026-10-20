import { shuffle } from './rng'
import type { PlayedMatch, RoundPlan, Standing } from './types'

/** Search-node budget per pairing attempt; keeps the "fewest rematches" fallback fast for 40 units. */
const MAX_SEARCH_NODES = 20_000

export interface SwissInput {
  readonly units: readonly string[]
  /** Current standings (match points and rank decide the order). Units missing here count as 0 points, ranked last. */
  readonly standings: readonly Standing[]
  /** Every match played so far; any pair that appears on opposite sides counts as "met". */
  readonly history: readonly PlayedMatch[]
  /** Units that already received a bye in earlier rounds (a bye leaves no trace in `history`). */
  readonly byeHistory?: readonly string[]
  readonly rng: () => number
}

interface Pairing {
  readonly pairs: readonly (readonly [string, string])[]
  readonly rematches: number
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

function metPairs(history: readonly PlayedMatch[]): Set<string> {
  const met = new Set<string>()
  for (const m of history) {
    for (const a of m.teamA) {
      for (const b of m.teamB) met.add(pairKey(a, b))
    }
  }
  return met
}

/** Units sorted by match points (desc), then standings rank (asc), then the given order. */
function rankedOrder(units: readonly string[], standings: readonly Standing[]): string[] {
  const info = new Map(standings.map((s) => [s.unit, s]))
  const points = (u: string): number => info.get(u)?.matchPoints ?? 0
  const rank = (u: string): number => info.get(u)?.rank ?? Number.POSITIVE_INFINITY
  return [...units].sort((a, b) => {
    if (points(a) !== points(b)) return points(b) - points(a)
    if (rank(a) === rank(b)) return 0
    return rank(a) < rank(b) ? -1 : 1
  })
}

/** Top-down depth-first search with backtracking; returns the pairing with the fewest rematches found. */
function pairUp(ordered: readonly string[], met: ReadonlySet<string>): Pairing {
  const state: { best: Pairing | null; nodes: number } = { best: null, nodes: 0 }

  const search = (remaining: readonly string[], current: readonly (readonly [string, string])[], cost: number): void => {
    if (state.best !== null && (cost >= state.best.rematches || state.nodes > MAX_SEARCH_NODES)) return
    if (remaining.length === 0) {
      state.best = { pairs: current, rematches: cost }
      return
    }
    state.nodes += 1
    const first = remaining[0] as string
    const rest = remaining.slice(1)
    for (let i = 0; i < rest.length; i += 1) {
      const partner = rest[i] as string
      const extra = met.has(pairKey(first, partner)) ? 1 : 0
      search(
        rest.filter((_, j) => j !== i),
        [...current, [first, partner] as const],
        cost + extra,
      )
    }
  }

  search(ordered, [], 0)
  return state.best as Pairing
}

/** Bye candidates: lowest-ranked first, units without a previous bye ahead of those who had one. */
function byeCandidates(ordered: readonly string[], byeHistory: ReadonlySet<string>): string[] {
  const lowestFirst = [...ordered].reverse()
  return [...lowestFirst.filter((u) => !byeHistory.has(u)), ...lowestFirst.filter((u) => byeHistory.has(u))]
}

function toPlan(pairing: Pairing, byes: readonly string[]): RoundPlan {
  return {
    matches: pairing.pairs.map(([a, b]) => ({ teamA: [a], teamB: [b] })),
    byes,
  }
}

/**
 * Swiss pairing for one round. Round 1 (empty history) is random. Later rounds pair top-down by match
 * points, preferring opponents with equal (or nearest) points that have not been met; backtracks to
 * find a rematch-free pairing and otherwise accepts the fewest rematches.
 * Odd count: the bye goes to the lowest-ranked unit without a previous bye (trying higher candidates
 * only if that choice would force extra rematches).
 */
export function swissPairing(input: SwissInput): RoundPlan {
  const ordered = input.history.length === 0 ? shuffle(input.units, input.rng) : rankedOrder(input.units, input.standings)
  const met = metPairs(input.history)

  if (ordered.length % 2 === 0) return toPlan(pairUp(ordered, met), [])

  let bestBye = ''
  let bestPairing: Pairing | null = null
  for (const candidate of byeCandidates(ordered, new Set(input.byeHistory ?? []))) {
    const pairing = pairUp(
      ordered.filter((u) => u !== candidate),
      met,
    )
    if (bestPairing === null || pairing.rematches < bestPairing.rematches) {
      bestBye = candidate
      bestPairing = pairing
    }
    if (pairing.rematches === 0) break
  }
  return toPlan(bestPairing as Pairing, [bestBye])
}
