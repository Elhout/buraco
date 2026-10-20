import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { InvalidPlayerCountError, rotatingTables } from './rotating'
import type { PlayedMatch, RoundPlan } from './types'

const players = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
const key = (a: string, b: string): string => [a, b].sort().join('|')

const toHistory = (plan: RoundPlan): PlayedMatch[] => plan.matches.map((m) => ({ ...m, result: 'a', pointsA: 1500, pointsB: 1000 }))

const partnerKeys = (plan: RoundPlan): string[] =>
  plan.matches.flatMap((m) => [key(m.teamA[0] as string, m.teamA[1] as string), key(m.teamB[0] as string, m.teamB[1] as string)])

describe('rotatingTables', () => {
  it.each([0, 3, 6, 13])('throws InvalidPlayerCountError for %i players', (n) => {
    expect(() => rotatingTables({ players: players(n), history: [], rng: createRng(1) })).toThrow(InvalidPlayerCountError)
  })

  it('seats four players on one table as 2v2 with no byes', () => {
    const plan = rotatingTables({ players: players(4), history: [], rng: createRng(1) })
    expect(plan.byes).toEqual([])
    expect(plan.matches).toHaveLength(1)
    const m = plan.matches[0]
    expect(m?.teamA).toHaveLength(2)
    expect(m?.teamB).toHaveLength(2)
    expect(new Set([...(m?.teamA ?? []), ...(m?.teamB ?? [])]).size).toBe(4)
  })

  it('uses every player exactly once per round', () => {
    const plan = rotatingTables({ players: players(12), history: [], rng: createRng(2) })
    expect(plan.matches).toHaveLength(3)
    const all = plan.matches.flatMap((m) => [...m.teamA, ...m.teamB])
    expect([...all].sort()).toEqual(players(12))
  })

  it('has zero partner repeats for 12 players over 3 rounds', () => {
    const roster = players(12)
    let history: PlayedMatch[] = []
    const seen = new Set<string>()
    for (let round = 0; round < 3; round += 1) {
      const plan = rotatingTables({ players: roster, history, rng: createRng(100 + round) })
      for (const k of partnerKeys(plan)) {
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
      history = [...history, ...toHistory(plan)]
    }
    expect(seen.size).toBe(18)
  })

  it('has zero partner repeats for 8 players over 4 rounds', () => {
    const roster = players(8)
    let history: PlayedMatch[] = []
    const seen = new Set<string>()
    for (let round = 0; round < 4; round += 1) {
      const plan = rotatingTables({ players: roster, history, rng: createRng(7 + round) })
      for (const k of partnerKeys(plan)) {
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
      history = [...history, ...toHistory(plan)]
    }
  })

  it('picks the only unused partner split for four players', () => {
    const roster = ['a', 'b', 'c', 'd']
    const mk = (a: string[], b: string[]): PlayedMatch => ({ teamA: a, teamB: b, result: 'a', pointsA: 1, pointsB: 0 })
    const history = [mk(['a', 'b'], ['c', 'd']), mk(['a', 'c'], ['b', 'd'])]
    const plan = rotatingTables({ players: roster, history, rng: createRng(5) })
    expect(partnerKeys(plan).sort()).toEqual(['a|d', 'b|c'])
  })

  it('still returns a valid table when every split has been used', () => {
    const roster = ['a', 'b', 'c', 'd']
    const mk = (a: string[], b: string[]): PlayedMatch => ({ teamA: a, teamB: b, result: null, pointsA: 0, pointsB: 0 })
    const history = [mk(['a', 'b'], ['c', 'd']), mk(['a', 'c'], ['b', 'd']), mk(['a', 'd'], ['b', 'c'])]
    const plan = rotatingTables({ players: roster, history, rng: createRng(5), attempts: 5 })
    expect(plan.matches).toHaveLength(1)
    expect(new Set(plan.matches.flatMap((m) => [...m.teamA, ...m.teamB])).size).toBe(4)
  })

  it('is deterministic for a given rng seed', () => {
    const run = (): RoundPlan => rotatingTables({ players: players(8), history: [], rng: createRng(11) })
    expect(run()).toEqual(run())
  })

  it('accepts a single attempt', () => {
    const plan = rotatingTables({ players: players(8), history: [], rng: createRng(3), attempts: 1 })
    expect(plan.matches).toHaveLength(2)
  })

  it('does not mutate its inputs', () => {
    const roster = players(8)
    const copy = [...roster]
    rotatingTables({ players: roster, history: [], rng: createRng(1) })
    expect(roster).toEqual(copy)
  })

  it('ignores history rows that are not 2v2', () => {
    const history: PlayedMatch[] = [{ teamA: ['p01'], teamB: ['p02'], result: 'a', pointsA: 1, pointsB: 0 }]
    const plan = rotatingTables({ players: players(4), history, rng: createRng(1) })
    expect(plan.matches).toHaveLength(1)
  })
})
