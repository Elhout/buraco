import { describe, expect, it } from 'vitest'
import {
  ELO_K,
  ELO_PROVISIONAL_GAMES,
  ELO_START,
  RATING_PRIOR_GAMES,
  type RatedGame,
  adjustedWinRate,
  eloExpected,
  rateGames,
} from './rating'

describe('adjustedWinRate', () => {
  it('counts every player as if they also had 5 wins and 5 losses', () => {
    expect(RATING_PRIOR_GAMES).toBe(10)
    expect(adjustedWinRate(3, 3)).toBeCloseTo(8 / 13)
    expect(adjustedWinRate(7, 10)).toBeCloseTo(12 / 20)
    expect(adjustedWinRate(65, 100)).toBeCloseTo(70 / 110)
  })

  it('starts at 50% and a long record outweighs a short lucky streak', () => {
    expect(adjustedWinRate(0, 0)).toBe(0.5)
    expect(adjustedWinRate(65, 100)).toBeGreaterThan(adjustedWinRate(3, 3))
    expect(adjustedWinRate(3, 3)).toBeGreaterThan(adjustedWinRate(7, 10))
  })

  it('counts a draw as half a win', () => {
    expect(adjustedWinRate(4, 10, 2)).toBeCloseTo(10 / 20)
  })
})

describe('Elo for pairs', () => {
  it('moves both partners by 16 after a game between equal teams', () => {
    const r = rateGames([{ teamA: ['a', 'b'], teamB: ['c', 'd'], winner: 'A' }])
    expect(r.get('a')).toEqual({ rating: 1516, games: 1 })
    expect(r.get('b')).toEqual({ rating: 1516, games: 1 })
    expect(r.get('c')).toEqual({ rating: 1484, games: 1 })
    expect(eloExpected(1500, 1500)).toBe(0.5)
    expect(ELO_START).toBe(1500)
    expect(ELO_K).toBe(32)
  })

  it('rewards beating a stronger pair more than beating a weaker one', () => {
    const setup: RatedGame[] = [
      { teamA: ['s1', 's2'], teamB: ['w1', 'w2'], winner: 'A' },
      { teamA: ['s1', 's2'], teamB: ['w1', 'w2'], winner: 'A' },
    ]
    const before = rateGames(setup)
    const upset = rateGames([...setup, { teamA: ['x', 'y'], teamB: ['s1', 's2'], winner: 'A' }])
    const easy = rateGames([...setup, { teamA: ['x', 'y'], teamB: ['w1', 'w2'], winner: 'A' }])
    expect(upset.get('x')!.rating - ELO_START).toBeGreaterThan(easy.get('x')!.rating - ELO_START)
    // What one side gains the other loses.
    expect(upset.get('s1')!.rating - before.get('s1')!.rating).toBeCloseTo(ELO_START - upset.get('x')!.rating)
  })

  it('a draw moves ratings toward each other; guests count as 1500 and are not rated', () => {
    const r = rateGames([
      { teamA: ['a', 'b'], teamB: ['c', 'd'], winner: 'A' },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], winner: null },
    ])
    expect(r.get('a')!.rating).toBeLessThan(1516)
    expect(r.get('c')!.rating).toBeGreaterThan(1484)
    const withGuest = rateGames([{ teamA: ['a', null], teamB: ['c', 'd'], winner: 'B' }])
    expect([...withGuest.keys()].sort()).toEqual(['a', 'c', 'd'])
    expect(withGuest.get('a')).toEqual({ rating: 1484, games: 1 })
  })

  it('uses the latest rating: playing more does not by itself raise it', () => {
    const r = rateGames([
      { teamA: ['a', 'b'], teamB: ['c', 'd'], winner: 'A' },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], winner: 'B' },
    ])
    expect(r.get('a')!.games).toBe(2)
    expect(r.get('a')!.rating).toBeLessThan(1500 + 0.001)
    expect(ELO_PROVISIONAL_GAMES).toBe(5)
  })
})
