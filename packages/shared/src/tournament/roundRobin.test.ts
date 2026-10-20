import { describe, expect, it } from 'vitest'
import { roundRobinSchedule } from './roundRobin'

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i + 1}`)
const key = (a: string, b: string): string => [a, b].sort().join('|')

describe('roundRobinSchedule', () => {
  it('returns no rounds for fewer than two units', () => {
    expect(roundRobinSchedule([])).toEqual([])
    expect(roundRobinSchedule(['solo'])).toEqual([])
  })

  it('schedules a single match for two units', () => {
    expect(roundRobinSchedule(['a', 'b'])).toEqual([{ matches: [{ teamA: ['a'], teamB: ['b'] }], byes: [] }])
  })

  it('makes every pair meet exactly once with an even count and no byes', () => {
    const rounds = roundRobinSchedule(ids(6))
    expect(rounds).toHaveLength(5)
    const seen = new Map<string, number>()
    for (const round of rounds) {
      expect(round.byes).toEqual([])
      expect(round.matches).toHaveLength(3)
      const inRound = round.matches.flatMap((m) => [...m.teamA, ...m.teamB])
      expect(new Set(inRound).size).toBe(6)
      for (const m of round.matches) {
        const k = key(m.teamA[0] as string, m.teamB[0] as string)
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
    }
    expect(seen.size).toBe(15)
    expect([...seen.values()].every((c) => c === 1)).toBe(true)
  })

  it('gives each unit exactly one bye with an odd count', () => {
    const rounds = roundRobinSchedule(ids(5))
    expect(rounds).toHaveLength(5)
    const byeCount = new Map<string, number>()
    const seen = new Set<string>()
    for (const round of rounds) {
      expect(round.byes).toHaveLength(1)
      expect(round.matches).toHaveLength(2)
      for (const b of round.byes) byeCount.set(b, (byeCount.get(b) ?? 0) + 1)
      const inRound = [...round.matches.flatMap((m) => [...m.teamA, ...m.teamB]), ...round.byes]
      expect(new Set(inRound).size).toBe(5)
      for (const m of round.matches) seen.add(key(m.teamA[0] as string, m.teamB[0] as string))
    }
    expect(seen.size).toBe(10)
    expect(byeCount.size).toBe(5)
    expect([...byeCount.values()].every((c) => c === 1)).toBe(true)
  })

  it('does not mutate its input', () => {
    const input = ids(5)
    const copy = [...input]
    roundRobinSchedule(input)
    expect(input).toEqual(copy)
  })
})
