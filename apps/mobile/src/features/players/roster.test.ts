import { describe, expect, it } from 'vitest'
import { buildRoster, matchesName } from './roster'

describe('buildRoster', () => {
  const members = [
    { userId: 'a', name: 'Samy' },
    { userId: 'b', name: 'AK' },
    { userId: 'c', name: 'Noby' },
    { userId: 'd', name: 'Hadida' },
  ]

  it('lists every member, most wins first, then the better rate, then by name', () => {
    const stats = [
      { user_id: 'a', games: 10, wins: 6 },
      { user_id: 'b', games: 8, wins: 6 },
      { user_id: 'c', games: 3, wins: 1 },
    ]
    expect(buildRoster(members, stats, 'en').map((r) => [r.name, r.games, r.wins])).toEqual([
      ['AK', 8, 6],
      ['Samy', 10, 6],
      ['Noby', 3, 1],
      ['Hadida', 0, 0],
    ])
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
