import { describe, expect, it } from 'vitest'
import { RANKED_MIN_GAMES, buildRoster, matchesName } from './roster'

describe('buildRoster', () => {
  const members = [
    { userId: 'a', name: 'Samy' },
    { userId: 'b', name: 'AK' },
    { userId: 'c', name: 'Noby' },
    { userId: 'd', name: 'Hadida' },
    { userId: 'e', name: 'Ali' },
  ]

  it('ranks by win %, not by how many games were won', () => {
    const stats = [
      { user_id: 'a', games: 40, wins: 22, losses: 18 }, // 55%, most wins
      { user_id: 'b', games: 10, wins: 7, losses: 3 }, // 70%
      { user_id: 'c', games: 6, wins: 2, losses: 4 }, // 33%
    ]
    expect(buildRoster(members, stats, 'en').map((r) => [r.name, Math.round(r.winRate * 100), r.isNew])).toEqual([
      ['AK', 70, false],
      ['Samy', 55, false],
      ['Noby', 33, false],
      ['Ali', 0, false],
      ['Hadida', 0, false],
    ])
  })

  it('lists players under 5 games as new, after the ranked ones, most games first', () => {
    expect(RANKED_MIN_GAMES).toBe(5)
    const stats = [
      { user_id: 'a', games: 3, wins: 3 }, // 100% but only 3 games
      { user_id: 'b', games: 5, wins: 1 }, // 20%, ranked
      { user_id: 'c', games: 4, wins: 1 },
    ]
    expect(buildRoster(members, stats, 'en').map((r) => [r.name, r.isNew])).toEqual([
      ['AK', false],
      ['Noby', true],
      ['Samy', true],
      ['Ali', false],
      ['Hadida', false],
    ])
  })

  it('breaks an equal win % by more games, then by name', () => {
    const stats = [
      { user_id: 'a', games: 10, wins: 5 },
      { user_id: 'b', games: 20, wins: 10 },
      { user_id: 'c', games: 10, wins: 5 },
    ]
    expect(
      buildRoster(members, stats, 'en')
        .map((r) => r.name)
        .slice(0, 3),
    ).toEqual(['AK', 'Noby', 'Samy'])
  })

  it('carries losses, 0 when unknown', () => {
    const rows = buildRoster(members.slice(0, 2), [{ user_id: 'a', games: 10, wins: 6, losses: 4 }], 'en')
    expect(rows.map((r) => [r.name, r.losses])).toEqual([
      ['Samy', 4],
      ['AK', 0],
    ])
  })
})

describe('matchesName', () => {
  it('finds by any part of the name, ignoring case and accents', () => {
    expect(matchesName('Samy', 'sam')).toBe(true)
    expect(matchesName('Bo Rashid', 'RASH')).toBe(true)
    expect(matchesName('Zoë', 'zoe')).toBe(true)
    expect(matchesName('سامي', 'سا')).toBe(true)
    expect(matchesName('AK', 'mk')).toBe(false)
  })

  it('matches everyone for an empty or blank query', () => {
    expect(matchesName('AK', '')).toBe(true)
    expect(matchesName('AK', '   ')).toBe(true)
  })
})
