import { describe, expect, it } from 'vitest'
import { KnockoutError, isKnockoutComplete, knockoutBracket, nextKnockoutRound } from './knockout'
import type { Match } from './types'

const seeds = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i + 1}`)
const m = (a: string, b: string): Match => ({ teamA: [a], teamB: [b] })

describe('knockoutBracket', () => {
  it('returns an empty plan for no seeds', () => {
    expect(knockoutBracket([])).toEqual({ matches: [], byes: [] })
  })

  it('returns a lone champion for one seed', () => {
    expect(knockoutBracket(['s1'])).toEqual({ matches: [], byes: ['s1'] })
  })

  it('seeds a single match for two', () => {
    expect(knockoutBracket(seeds(2))).toEqual({ matches: [m('s1', 's2')], byes: [] })
  })

  it('uses standard seeding for 8 seeds', () => {
    expect(knockoutBracket(seeds(8))).toEqual({
      matches: [m('s1', 's8'), m('s4', 's5'), m('s2', 's7'), m('s3', 's6')],
      byes: [],
    })
  })

  it('uses standard seeding for 4 seeds', () => {
    expect(knockoutBracket(seeds(4)).matches).toEqual([m('s1', 's4'), m('s2', 's3')])
  })

  it('gives byes to the top seeds when padding to a power of two', () => {
    expect(knockoutBracket(seeds(6))).toEqual({
      matches: [m('s4', 's5'), m('s3', 's6')],
      byes: ['s1', 's2'],
    })
    expect(knockoutBracket(seeds(5))).toEqual({
      matches: [m('s4', 's5')],
      byes: ['s1', 's2', 's3'],
    })
  })

  it('does not mutate its input', () => {
    const input = seeds(6)
    knockoutBracket(input)
    expect(input).toEqual(seeds(6))
  })
})

describe('nextKnockoutRound', () => {
  it('pairs winners in bracket order', () => {
    const first = knockoutBracket(seeds(8))
    const next = nextKnockoutRound(
      first.matches.map((match, i) => ({ match, winner: i === 1 ? ('B' as const) : ('A' as const) })),
      [],
    )
    // winners: s1, s5, s2, s3
    expect(next).toEqual({ matches: [m('s1', 's5'), m('s2', 's3')], byes: [] })
  })

  it('slots bye teams into their bracket positions (6 seeds)', () => {
    const first = knockoutBracket(seeds(6))
    const next = nextKnockoutRound(
      [
        { match: first.matches[0] as Match, winner: 'A' },
        { match: first.matches[1] as Match, winner: 'B' },
      ],
      first.byes,
    )
    // positions: bye s1, winner s4, bye s2, winner s6
    expect(next).toEqual({ matches: [m('s1', 's4'), m('s2', 's6')], byes: [] })
  })

  it('slots bye teams into their bracket positions (5 seeds)', () => {
    const first = knockoutBracket(seeds(5))
    const next = nextKnockoutRound([{ match: first.matches[0] as Match, winner: 'B' }], first.byes)
    expect(next).toEqual({ matches: [m('s1', 's5'), m('s2', 's3')], byes: [] })
  })

  it('reports the champion after the final', () => {
    const next = nextKnockoutRound([{ match: m('s1', 's2'), winner: 'B' }], [])
    expect(next).toEqual({ matches: [], byes: ['s2'] })
    expect(isKnockoutComplete(next)).toBe(true)
  })

  it('keeps whole teams as entrants and flattens a champion team into byes', () => {
    const semi = [
      { match: { teamA: ['a', 'b'], teamB: ['c', 'd'] }, winner: 'A' as const },
      { match: { teamA: ['e', 'f'], teamB: ['g', 'h'] }, winner: 'B' as const },
    ]
    const final = nextKnockoutRound(semi, [])
    expect(final.matches).toEqual([{ teamA: ['a', 'b'], teamB: ['g', 'h'] }])
    const done = nextKnockoutRound([{ match: final.matches[0] as Match, winner: 'B' }], [])
    expect(done).toEqual({ matches: [], byes: ['g', 'h'] })
  })

  it('throws KnockoutError when the entrant count is not a power of two', () => {
    const three = [m('a', 'b'), m('c', 'd'), m('e', 'f')].map((match) => ({ match, winner: 'A' as const }))
    expect(() => nextKnockoutRound(three, [])).toThrow(KnockoutError)
    expect(() => nextKnockoutRound([], [])).toThrow(KnockoutError)
  })
})

describe('isKnockoutComplete', () => {
  it('is true only for a single champion with no matches left', () => {
    expect(isKnockoutComplete({ matches: [], byes: ['s1'] })).toBe(true)
    expect(isKnockoutComplete({ matches: [], byes: [] })).toBe(false)
    expect(isKnockoutComplete({ matches: [m('a', 'b')], byes: [] })).toBe(false)
    expect(isKnockoutComplete({ matches: [], byes: ['a', 'b'] })).toBe(false)
  })
})
