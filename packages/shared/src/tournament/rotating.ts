import { shuffle } from './rng'
import type { PlayedMatch, RoundPlan } from './types'

const DEFAULT_ATTEMPTS = 200
/** A repeated partner always outweighs any realistic number of repeated opponents. */
const PARTNER_WEIGHT = 1000
const TABLE_SIZE = 4
/** The three ways to split four seats into two pairs (indices into the table). */
const SPLITS: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
]

export class InvalidPlayerCountError extends Error {
  constructor(count: number) {
    super(`Rotating partners needs a positive multiple of 4 players, got ${count}`)
    this.name = 'InvalidPlayerCountError'
  }
}

export interface RotatingInput {
  readonly players: readonly string[]
  readonly history: readonly PlayedMatch[]
  readonly rng: () => number
  /** Random restarts; default 200. */
  readonly attempts?: number
}

interface Counts {
  readonly partners: ReadonlyMap<string, number>
  readonly opponents: ReadonlyMap<string, number>
}

interface TableChoice {
  readonly cost: number
  readonly split: readonly [number, number, number, number]
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function countHistory(history: readonly PlayedMatch[]): Counts {
  const partners = new Map<string, number>()
  const opponents = new Map<string, number>()
  for (const m of history) {
    for (const team of [m.teamA, m.teamB]) {
      if (team.length === 2) bump(partners, pairKey(team[0] as string, team[1] as string))
    }
    for (const a of m.teamA) {
      for (const b of m.teamB) bump(opponents, pairKey(a, b))
    }
  }
  return { partners, opponents }
}

/** Cheapest way to split the four seats starting at `start` into two pairs. */
function bestSplit(seats: readonly string[], start: number, counts: Counts): TableChoice {
  const at = (i: number): string => seats[start + i] as string
  const weight = (map: ReadonlyMap<string, number>, a: string, b: string): number => map.get(pairKey(a, b)) ?? 0
  let best: TableChoice | null = null
  for (const split of SPLITS) {
    const [a1, a2, b1, b2] = split
    const cost =
      PARTNER_WEIGHT * (weight(counts.partners, at(a1), at(a2)) + weight(counts.partners, at(b1), at(b2))) +
      weight(counts.opponents, at(a1), at(b1)) +
      weight(counts.opponents, at(a1), at(b2)) +
      weight(counts.opponents, at(a2), at(b1)) +
      weight(counts.opponents, at(a2), at(b2))
    if (best === null || cost < best.cost) best = { cost, split }
  }
  return best as TableChoice
}

function totalCost(seats: readonly string[], counts: Counts): number {
  let sum = 0
  for (let start = 0; start < seats.length; start += TABLE_SIZE) sum += bestSplit(seats, start, counts).cost
  return sum
}

/** Hill-climb: swap players across tables while the total cost keeps dropping. */
function improve(initial: readonly string[], counts: Counts): { seats: string[]; cost: number } {
  const seats = [...initial]
  let cost = totalCost(seats, counts)
  let improved = cost > 0
  while (improved) {
    improved = false
    for (let i = 0; i < seats.length && cost > 0; i += 1) {
      for (let j = i + 1; j < seats.length && cost > 0; j += 1) {
        if (Math.floor(i / TABLE_SIZE) === Math.floor(j / TABLE_SIZE)) continue
        const a = seats[i] as string
        seats[i] = seats[j] as string
        seats[j] = a
        const next = totalCost(seats, counts)
        if (next < cost) {
          cost = next
          improved = true
        } else {
          seats[j] = seats[i] as string
          seats[i] = a
        }
      }
    }
  }
  return { seats, cost }
}

/**
 * Seats players at 2v2 tables for one round of rotating-partner play.
 * Minimizes partner repeats first, then opponent repeats, via random restarts plus local swaps.
 * Deterministic given the rng. Callers add ghost seats so the count is a multiple of 4.
 */
export function rotatingTables(input: RotatingInput): RoundPlan {
  const count = input.players.length
  if (count === 0 || count % TABLE_SIZE !== 0) throw new InvalidPlayerCountError(count)

  const counts = countHistory(input.history)
  const attempts = Math.max(1, input.attempts ?? DEFAULT_ATTEMPTS)
  let best: { seats: string[]; cost: number } | null = null
  for (let n = 0; n < attempts; n += 1) {
    const candidate = improve(shuffle(input.players, input.rng), counts)
    if (best === null || candidate.cost < best.cost) best = candidate
    if (best.cost === 0) break
  }

  const seats = (best as { seats: string[] }).seats
  const matches = []
  for (let start = 0; start < count; start += TABLE_SIZE) {
    const [a1, a2, b1, b2] = bestSplit(seats, start, counts).split
    const at = (i: number): string => seats[start + i] as string
    matches.push({ teamA: [at(a1), at(a2)], teamB: [at(b1), at(b2)] })
  }
  return { matches, byes: [] }
}
