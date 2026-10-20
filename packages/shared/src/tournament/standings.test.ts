import { describe, expect, it } from 'vitest'
import { computeStandings } from './standings'
import type { MatchResult, PlayedMatch } from './types'

const game = (a: string[], b: string[], result: MatchResult, pointsA: number, pointsB: number): PlayedMatch => ({
  teamA: a,
  teamB: b,
  result,
  pointsA,
  pointsB,
})

const order = (s: readonly { unit: string }[]): string[] => s.map((x) => x.unit)

describe('computeStandings basics', () => {
  it('ranks idle units by id with zeroed stats and distinct ranks', () => {
    const s = computeStandings({ units: ['c', 'a', 'b'], matches: [] })
    expect(order(s)).toEqual(['a', 'b', 'c'])
    expect(s.map((x) => x.rank)).toEqual([1, 2, 3])
    expect(s[0]).toEqual({
      unit: 'a',
      rank: 1,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      matchPoints: 0,
      differential: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  it('awards 2 / 1 / 0 match points and counts results', () => {
    const s = computeStandings({
      units: ['a', 'b', 'c'],
      matches: [game(['a'], ['b'], 'a', 2000, 1500), game(['b'], ['c'], 'draw', 1200, 1200), game(['c'], ['a'], 'a', 900, 800)],
    })
    const by = Object.fromEntries(s.map((x) => [x.unit, x]))
    expect(by.a).toMatchObject({
      played: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      matchPoints: 2,
      pointsFor: 2800,
      pointsAgainst: 2400,
      differential: 400,
    })
    expect(by.b).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, matchPoints: 1, differential: -500 })
    expect(by.c).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, matchPoints: 3 })
  })

  it('treats a b-win as a loss for side A', () => {
    const s = computeStandings({ units: ['a', 'b'], matches: [game(['a'], ['b'], 'b', 100, 200)] })
    expect(order(s)).toEqual(['b', 'a'])
  })

  it('ignores unfinished matches and unknown units', () => {
    const s = computeStandings({
      units: ['a', 'b'],
      matches: [game(['a'], ['b'], null, 500, 400), game(['a'], ['ghost'], 'a', 100, 0)],
    })
    expect(s.find((x) => x.unit === 'a')).toMatchObject({ played: 1, matchPoints: 2 })
    expect(s.find((x) => x.unit === 'b')).toMatchObject({ played: 0, matchPoints: 0 })
    expect(s).toHaveLength(2)
  })

  it('gives every unit on a side that side outcome (rotating mode)', () => {
    const s = computeStandings({
      units: ['p1', 'p2', 'p3', 'p4'],
      matches: [game(['p1', 'p2'], ['p3', 'p4'], 'a', 1500, 1000)],
    })
    expect(s.filter((x) => x.matchPoints === 2).map((x) => x.unit)).toEqual(['p1', 'p2'])
    expect(s.filter((x) => x.matchPoints === 0).map((x) => x.unit)).toEqual(['p3', 'p4'])
  })

  it('does not mutate its inputs', () => {
    const units = ['b', 'a']
    const matches = [game(['a'], ['b'], 'a', 10, 5)]
    const snapshot = JSON.stringify({ units, matches })
    computeStandings({ units, matches })
    expect(JSON.stringify({ units, matches })).toBe(snapshot)
  })
})

describe('computeStandings byes', () => {
  it('counts a bye as a win with zero differential and zero points', () => {
    const s = computeStandings({ units: ['a', 'b'], matches: [], byes: ['a'] })
    expect(s[0]).toMatchObject({ unit: 'a', played: 1, wins: 1, matchPoints: 2, differential: 0, pointsFor: 0, pointsAgainst: 0 })
    expect(s[1]).toMatchObject({ unit: 'b', played: 0, matchPoints: 0 })
  })

  it('ignores byes for unknown units', () => {
    const s = computeStandings({ units: ['a'], matches: [], byes: ['nobody'] })
    expect(s).toHaveLength(1)
    expect(s[0]?.matchPoints).toBe(0)
  })
})

describe('computeStandings tiebreaks', () => {
  it('caps the per-match differential at 1000 but keeps raw points', () => {
    const s = computeStandings({ units: ['a', 'b'], matches: [game(['a'], ['b'], 'a', 2500, 0)] })
    expect(s[0]).toMatchObject({ unit: 'a', differential: 1000, pointsFor: 2500 })
    expect(s[1]).toMatchObject({ unit: 'b', differential: -1000, pointsAgainst: 2500 })
  })

  it('caps negative differentials too', () => {
    const s = computeStandings({ units: ['a', 'b'], matches: [game(['a'], ['b'], 'b', 0, 3000)] })
    expect(s.find((x) => x.unit === 'a')?.differential).toBe(-1000)
  })

  it('breaks match point ties by differential', () => {
    const s = computeStandings({
      units: ['a', 'b', 'x', 'y'],
      matches: [game(['a'], ['x'], 'a', 1500, 1400), game(['b'], ['y'], 'a', 1500, 500)],
    })
    expect(order(s).slice(0, 2)).toEqual(['b', 'a'])
  })

  it('breaks match point and differential ties by head-to-head before points scored', () => {
    // a and b: 2 match points, differential 0. b beat a. a scored more points overall.
    const s = computeStandings({
      units: ['a', 'b', 'x', 'y'],
      matches: [game(['b'], ['a'], 'a', 1500, 1400), game(['a'], ['x'], 'a', 1500, 1400), game(['y'], ['b'], 'a', 1100, 1000)],
    })
    const by = Object.fromEntries(s.map((x) => [x.unit, x]))
    expect(by.a).toMatchObject({ matchPoints: 2, differential: 0, pointsFor: 2900 })
    expect(by.b).toMatchObject({ matchPoints: 2, differential: 0, pointsFor: 2500 })
    expect(order(s)).toEqual(['y', 'b', 'a', 'x'])
  })

  it('falls back to points scored when tied units never met', () => {
    const s = computeStandings({
      units: ['a', 'b', 'x', 'y'],
      matches: [game(['b'], ['x'], 'a', 1500, 1400), game(['a'], ['y'], 'a', 1100, 1000)],
    })
    expect(order(s).slice(0, 2)).toEqual(['b', 'a'])
  })

  it('uses unit id as the last tiebreak and assigns distinct ranks', () => {
    const s = computeStandings({
      units: ['d', 'c', 'b', 'a'],
      matches: [game(['a'], ['b'], 'draw', 1000, 1000), game(['c'], ['d'], 'draw', 1000, 1000)],
    })
    expect(order(s)).toEqual(['a', 'b', 'c', 'd'])
    expect(s.map((x) => x.rank)).toEqual([1, 2, 3, 4])
  })

  it('does not count partners as head-to-head opponents', () => {
    // p2 outscored p1 in total points would not matter: partners never faced each other.
    const s = computeStandings({
      units: ['p1', 'p2', 'p3', 'p4'],
      matches: [game(['p1', 'p2'], ['p3', 'p4'], 'a', 1500, 1000)],
    })
    expect(order(s)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('counts head-to-head only for opposing sides in rotating mode', () => {
    // p1/p2 tied on points and differential overall; p2 beat p1 when they were opponents.
    const s = computeStandings({
      units: ['p1', 'p2', 'p3', 'p4'],
      matches: [game(['p2', 'p3'], ['p1', 'p4'], 'a', 1500, 1400), game(['p1', 'p3'], ['p2', 'p4'], 'a', 1500, 1400)],
    })
    const by = Object.fromEntries(s.map((x) => [x.unit, x]))
    expect(by.p1?.matchPoints).toBe(by.p2?.matchPoints)
    expect(by.p3?.matchPoints).toBe(4)
    expect(order(s)[0]).toBe('p3')
  })
})
