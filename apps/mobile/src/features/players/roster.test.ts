import { describe, expect, it } from 'vitest'
import { buildRoster, matchesName } from './roster'

describe('buildRoster', () => {
  const members = [
    { userId: 'a', name: 'Samy' },
    { userId: 'b', name: 'AK' },
    { userId: 'c', name: 'Noby' },
    { userId: 'd', name: 'Hadida' },
  ]

  it('ranks by adjusted win rate, not by how many games were won', () => {
    const stats = [
      { user_id: 'a', games: 40, wins: 22 }, // 55%: most wins, (27/50) 54%
      { user_id: 'b', games: 4, wins: 4 }, // 100% over few games: (9/14) 64%
      { user_id: 'c', games: 3, wins: 1 }, // (6/13) 46%
    ]
    expect(buildRoster(members, stats, 'en').map((r) => [r.name, r.games, r.wins])).toEqual([
      ['AK', 4, 4],
      ['Samy', 40, 22],
      ['Noby', 3, 1],
      ['Hadida', 0, 0],
    ])
  })

  it('a long strong record still beats a short perfect one', () => {
    const stats = [
      { user_id: 'a', games: 100, wins: 70 }, // 75/110 = 68%
      { user_id: 'b', games: 3, wins: 3 }, // 8/13 = 62%
    ]
    expect(
      buildRoster(members, stats, 'en')
        .map((r) => r.name)
        .slice(0, 2),
    ).toEqual(['Samy', 'AK'])
  })

  it('breaks an equal score by more games played', () => {
    const stats = [
      { user_id: 'a', games: 10, wins: 5 },
      { user_id: 'b', games: 20, wins: 10 },
    ]
    expect(
      buildRoster(members, stats, 'en')
        .map((r) => r.name)
        .slice(0, 2),
    ).toEqual(['AK', 'Samy'])
  })

  it('carries losses, 0 when unknown', () => {
    const rows = buildRoster(members, [{ user_id: 'a', games: 10, wins: 6, losses: 4 }], 'en')
    expect(rows.map((r) => [r.name, r.losses])).toEqual([
      ['Samy', 4],
      ['AK', 0],
      ['Hadida', 0],
      ['Noby', 0],
    ])
  })

  it('keeps members without any games, sorted by name', () => {
    expect(buildRoster(members, [], 'en').map((r) => r.name)).toEqual(['AK', 'Hadida', 'Noby', 'Samy'])
  })
})

describe('buildRoster with Elo ratings', () => {
  const members = [
    { userId: 'a', name: 'Samy' },
    { userId: 'b', name: 'AK' },
    { userId: 'c', name: 'Noby' },
    { userId: 'd', name: 'Hadida' },
  ]
  const stats = [
    { user_id: 'a', games: 60, wins: 40 },
    { user_id: 'b', games: 3, wins: 2 },
    { user_id: 'c', games: 12, wins: 4 },
  ]

  it('ranks by rating (rounded), flags fewer than 5 games as provisional, no games last', () => {
    const ratings = new Map([
      ['a', 1561.4],
      ['b', 1588.6],
      ['c', 1470.2],
    ])
    expect(buildRoster(members, stats, 'en', ratings).map((r) => [r.name, r.rating, r.provisional])).toEqual([
      ['AK', 1589, true],
      ['Samy', 1561, false],
      ['Noby', 1470, false],
      ['Hadida', null, true],
    ])
  })

  it('falls back to the adjusted win rate while ratings load', () => {
    expect(buildRoster(members, stats, 'en').map((r) => r.name)).toEqual(['Samy', 'AK', 'Noby', 'Hadida'])
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
