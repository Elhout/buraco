import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { swissPairing } from './swiss'
import type { PlayedMatch, Standing } from './types'

const standing = (unit: string, rank: number, matchPoints: number): Standing => ({
  unit,
  rank,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  matchPoints,
  differential: 0,
  pointsFor: 0,
  pointsAgainst: 0,
})

const played = (a: string, b: string): PlayedMatch => ({
  teamA: [a],
  teamB: [b],
  result: 'a',
  pointsA: 1500,
  pointsB: 1000,
})

const key = (a: string, b: string): string => [a, b].sort().join('|')

const pairKeys = (plan: ReturnType<typeof swissPairing>): string[] =>
  plan.matches.map((m) => key(m.teamA[0] as string, m.teamB[0] as string))

const rematches = (plan: ReturnType<typeof swissPairing>, history: readonly PlayedMatch[]): number => {
  const met = new Set(history.map((h) => key(h.teamA[0] as string, h.teamB[0] as string)))
  return pairKeys(plan).filter((k) => met.has(k)).length
}

const ranked = (units: readonly string[], points: readonly number[]): Standing[] =>
  units.map((u, i) => standing(u, i + 1, points[i] as number))

describe('swissPairing round 1', () => {
  const units = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('pairs every unit exactly once with no byes for an even count', () => {
    const plan = swissPairing({ units, standings: [], history: [], rng: createRng(1) })
    expect(plan.matches).toHaveLength(4)
    expect(plan.byes).toEqual([])
    const all = plan.matches.flatMap((m) => [...m.teamA, ...m.teamB])
    expect([...all].sort()).toEqual(units)
  })

  it('is deterministic for a seed and varies across seeds', () => {
    const run = (seed: number): unknown => swissPairing({ units, standings: [], history: [], rng: createRng(seed) })
    expect(run(9)).toEqual(run(9))
    expect(run(9)).not.toEqual(run(10))
  })

  it('gives one random bye with an odd count', () => {
    const plan = swissPairing({
      units: ['a', 'b', 'c', 'd', 'e'],
      standings: [],
      history: [],
      rng: createRng(4),
    })
    expect(plan.matches).toHaveLength(2)
    expect(plan.byes).toHaveLength(1)
  })
})

describe('swissPairing later rounds', () => {
  it('pairs units with equal match points', () => {
    const history = [played('a', 'c'), played('b', 'd')]
    const plan = swissPairing({
      units: ['a', 'b', 'c', 'd'],
      standings: ranked(['a', 'b', 'c', 'd'], [2, 2, 0, 0]),
      history,
      rng: createRng(1),
    })
    expect(pairKeys(plan).sort()).toEqual(['a|b', 'c|d'])
  })

  it('orders by match points first, then by standing rank, ignoring input order', () => {
    const history = [played('a', 'd'), played('b', 'c')]
    // Standings: d and c lead (rank 1, 2), then a, b
    const standings = [standing('c', 1, 2), standing('d', 2, 2), standing('a', 3, 0), standing('b', 4, 0)]
    const plan = swissPairing({ units: ['a', 'b', 'c', 'd'], standings, history, rng: createRng(1) })
    expect(pairKeys(plan).sort()).toEqual(['a|b', 'c|d'])
  })

  it('treats units missing from standings as zero points ranked last', () => {
    const history = [played('a', 'b')]
    const standings = [standing('a', 1, 2), standing('b', 2, 0)]
    const plan = swissPairing({ units: ['a', 'b', 'c', 'd'], standings, history, rng: createRng(1) })
    expect(rematches(plan, history)).toBe(0)
    expect(plan.matches).toHaveLength(2)
  })

  it('avoids a rematch even when the top two have already met', () => {
    const history = [played('a', 'b'), played('c', 'd')]
    const plan = swissPairing({
      units: ['a', 'b', 'c', 'd'],
      standings: ranked(['a', 'b', 'c', 'd'], [2, 2, 0, 0]),
      history,
      rng: createRng(1),
    })
    expect(rematches(plan, history)).toBe(0)
  })

  it('backtracks to find a no-rematch pairing when greedy pairing fails', () => {
    const units = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']
    // Greedy top-down would pair u5-u6, which have already met.
    const history = [played('u5', 'u6'), played('u1', 'u3'), played('u1', 'u4')]
    const plan = swissPairing({
      units,
      standings: ranked(units, [0, 0, 0, 0, 0, 0]),
      history,
      rng: createRng(1),
    })
    expect(plan.matches).toHaveLength(3)
    expect(rematches(plan, history)).toBe(0)
  })

  it('allows the fewest rematches when a clean pairing is impossible', () => {
    const history = [played('a', 'b'), played('a', 'c'), played('a', 'd')]
    const plan = swissPairing({
      units: ['a', 'b', 'c', 'd'],
      standings: ranked(['a', 'b', 'c', 'd'], [0, 0, 0, 0]),
      history,
      rng: createRng(1),
    })
    expect(plan.matches).toHaveLength(2)
    expect(rematches(plan, history)).toBe(1)
  })

  it('still returns a complete pairing quickly when every pair has met', () => {
    const units = Array.from({ length: 40 }, (_, i) => `p${String(i).padStart(2, '0')}`)
    const history: PlayedMatch[] = []
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) history.push(played(units[i] as string, units[j] as string))
    }
    const plan = swissPairing({
      units,
      standings: ranked(
        units,
        units.map(() => 0),
      ),
      history,
      rng: createRng(1),
    })
    expect(plan.matches).toHaveLength(20)
    expect(new Set(plan.matches.flatMap((m) => [...m.teamA, ...m.teamB])).size).toBe(40)
  })

  it('gives the bye to the lowest-ranked unit', () => {
    const units = ['a', 'b', 'c', 'd', 'e']
    const plan = swissPairing({
      units,
      standings: ranked(units, [4, 2, 2, 0, 0]),
      history: [played('a', 'b')],
      rng: createRng(1),
    })
    expect(plan.byes).toEqual(['e'])
    expect(plan.matches).toHaveLength(2)
  })

  it('skips units that already had a bye', () => {
    const units = ['a', 'b', 'c', 'd', 'e']
    const plan = swissPairing({
      units,
      standings: ranked(units, [4, 2, 2, 0, 0]),
      history: [played('a', 'b')],
      byeHistory: ['e'],
      rng: createRng(1),
    })
    expect(plan.byes).toEqual(['d'])
  })

  it('falls back to the lowest-ranked unit when everyone has had a bye', () => {
    const units = ['a', 'b', 'c']
    const plan = swissPairing({
      units,
      standings: ranked(units, [2, 2, 0]),
      history: [played('a', 'c')],
      byeHistory: ['a', 'b', 'c'],
      rng: createRng(1),
    })
    expect(plan.byes).toEqual(['c'])
  })

  it('picks a different bye candidate when the default one forces a rematch', () => {
    const units = ['a', 'b', 'c']
    const history = [played('a', 'b')]
    const plan = swissPairing({
      units,
      standings: ranked(units, [2, 0, 0]),
      history,
      rng: createRng(1),
    })
    // Bye to c would force a-b again; bye to b gives a-c with no rematch.
    expect(plan.byes).toEqual(['b'])
    expect(rematches(plan, history)).toBe(0)
  })

  it('returns an empty plan for no units and a lone bye for one unit', () => {
    expect(swissPairing({ units: [], standings: [], history: [], rng: createRng(1) })).toEqual({
      matches: [],
      byes: [],
    })
    expect(swissPairing({ units: ['a'], standings: [], history: [], rng: createRng(1) })).toEqual({
      matches: [],
      byes: ['a'],
    })
  })

  it('does not mutate its inputs', () => {
    const units = ['a', 'b', 'c', 'd']
    const history = [played('a', 'b')]
    const standings = ranked(units, [2, 0, 0, 0])
    const snapshot = JSON.stringify({ units, history, standings })
    swissPairing({ units, standings, history, rng: createRng(1) })
    expect(JSON.stringify({ units, history, standings })).toBe(snapshot)
  })
})
