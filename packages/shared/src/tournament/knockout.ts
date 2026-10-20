import type { Match, RoundPlan } from './types'

export class KnockoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnockoutError'
  }
}

export interface DecidedMatch {
  readonly match: Match
  readonly winner: 'A' | 'B'
}

const isPowerOfTwo = (n: number): boolean => n >= 1 && (n & (n - 1)) === 0

/**
 * Seed numbers (1-based) in bracket position order for a bracket of `size` slots, e.g. size 8 gives
 * 1,8,4,5,2,7,3,6. Adjacent entries form a first-round pairing (1 v 8, 4 v 5, 2 v 7, 3 v 6).
 */
function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const total = order.length * 2
    order = order.flatMap((seed) => [seed, total + 1 - seed])
  }
  return order
}

/**
 * Single-elimination first round with standard seeding (1 v N, 2 v N-1, ...). The field is padded to a
 * power of two; the missing opponents become byes for the top seeds, listed in seed order.
 * `seeds` is ordered best first.
 */
export function knockoutBracket(seeds: readonly string[]): RoundPlan {
  if (seeds.length < 2) return { matches: [], byes: [...seeds] }
  let size = 2
  while (size < seeds.length) size *= 2
  const order = bracketOrder(size)
  const matches: Match[] = []
  for (let i = 0; i < size; i += 2) {
    const high = order[i] as number
    const low = order[i + 1] as number
    if (low <= seeds.length) matches.push({ teamA: [seeds[high - 1] as string], teamB: [seeds[low - 1] as string] })
  }
  return { matches, byes: seeds.slice(0, size - seeds.length) }
}

/**
 * Builds the next round from the previous round's decided matches (in bracket order).
 * `byes` is the previous round's bye list; byes only exist in round one, where bye `i` is seed `i + 1`,
 * which fixes each bye team's bracket slot. Pass `[]` for later rounds.
 * When one entrant remains the returned plan has no matches and the champion as its only bye.
 */
export function nextKnockoutRound(previous: readonly DecidedMatch[], byes: readonly string[]): RoundPlan {
  const slots = previous.length + byes.length
  if (!isPowerOfTwo(slots)) {
    throw new KnockoutError(`Cannot build the next round from ${slots} entrants (not a power of two)`)
  }

  const winners = previous.map((p) => (p.winner === 'A' ? p.match.teamA : p.match.teamB))
  const entrants: (readonly string[])[] = []
  const order = bracketOrder(slots * 2)
  let nextWinner = 0
  for (let i = 0; i < slots * 2; i += 2) {
    const topSeed = Math.min(order[i] as number, order[i + 1] as number)
    if (topSeed <= byes.length) {
      entrants.push([byes[topSeed - 1] as string])
    } else {
      entrants.push(winners[nextWinner] as readonly string[])
      nextWinner += 1
    }
  }

  if (entrants.length === 1) return { matches: [], byes: [...(entrants[0] as readonly string[])] }
  const matches: Match[] = []
  for (let i = 0; i < entrants.length; i += 2) {
    matches.push({ teamA: entrants[i] as readonly string[], teamB: entrants[i + 1] as readonly string[] })
  }
  return { matches, byes: [] }
}

/** True once the bracket has produced a champion: no matches left and exactly one team standing. */
export function isKnockoutComplete(plan: RoundPlan): boolean {
  return plan.matches.length === 0 && plan.byes.length === 1
}
