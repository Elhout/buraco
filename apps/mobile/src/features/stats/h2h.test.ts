import { describe, expect, it } from 'vitest'
import { EMPTY_MATCHUP, firstShare, normalizePair, pairH2HFilter, pairMatchup, pairsOverlap, playerMatchup } from './h2h'
import type { PairH2HRow } from './select'

describe('playerMatchup', () => {
  it('reads wins, losses, draws and differential', () => {
    expect(
      playerMatchup({
        club_id: 'c',
        user_id: 'x',
        opponent_id: 'y',
        games: '7' as unknown as number,
        wins: 4,
        losses: 2,
        win_rate: 0.57,
        point_diff: 310,
      }),
    ).toEqual({ games: 7, winsFirst: 4, winsSecond: 2, draws: 1, pointDiff: 310 })
  })

  it('is empty without a row', () => {
    expect(playerMatchup(null)).toEqual(EMPTY_MATCHUP)
  })
})

describe('pairs', () => {
  it('normalizes as (least, greatest)', () => {
    expect(normalizePair('b', 'a')).toEqual(['a', 'b'])
    expect(normalizePair('a', 'b')).toEqual(['a', 'b'])
  })

  it('detects overlapping pairs', () => {
    expect(pairsOverlap(['a', 'b'], ['b', 'c'])).toBe(true)
    expect(pairsOverlap(['a', 'b'], ['c', 'd'])).toBe(false)
  })

  it('builds a filter for both orientations', () => {
    expect(pairH2HFilter(['a', 'b'], ['c', 'd'])).toBe(
      'and(pair_a1.eq.a,pair_a2.eq.b,pair_b1.eq.c,pair_b2.eq.d),and(pair_a1.eq.c,pair_a2.eq.d,pair_b1.eq.a,pair_b2.eq.b)',
    )
  })
})

const row = (a: readonly [string, string], b: readonly [string, string], wins: number, losses: number, diff: number): PairH2HRow => ({
  club_id: 'c',
  pair_a1: a[0],
  pair_a2: a[1],
  pair_b1: b[0],
  pair_b2: b[1],
  games: wins + losses,
  wins,
  losses,
  point_diff: diff,
})

describe('pairMatchup', () => {
  const X = ['a', 'b'] as const
  const Y = ['c', 'd'] as const

  it('uses the first pair orientation when present', () => {
    expect(pairMatchup([row(Y, X, 1, 3, -200), row(X, Y, 3, 1, 200)], X, Y)).toEqual({
      games: 4,
      winsFirst: 3,
      winsSecond: 1,
      draws: 0,
      pointDiff: 200,
    })
  })

  it('mirrors the other orientation', () => {
    expect(pairMatchup([row(Y, X, 1, 3, -200)], X, Y)).toEqual({ games: 4, winsFirst: 3, winsSecond: 1, draws: 0, pointDiff: 200 })
  })

  it('is empty when the pairs never met', () => {
    expect(pairMatchup([row(X, ['e', 'f'], 1, 0, 50)], X, Y)).toEqual(EMPTY_MATCHUP)
  })
})

describe('firstShare', () => {
  it('is the share of decided games', () => {
    expect(firstShare({ games: 5, winsFirst: 3, winsSecond: 1, draws: 1, pointDiff: 0 })).toBe(0.75)
    expect(firstShare(EMPTY_MATCHUP)).toBeNull()
  })
})
