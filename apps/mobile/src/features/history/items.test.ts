import { describe, expect, it } from 'vitest'
import { type HistoryRow, badgeOf, num, parseSeats, seatsOf, teamLabel, toHistoryItem } from './items'

const seatsJson = [
  { seat: 2, team: 'B', user_id: 'u2', name: 'Badr', verified_at: null },
  { seat: 1, team: 'A', user_id: 'u1', name: 'Amal', verified_at: '2026-10-19T20:00:00Z' },
  { seat: 3, team: 'A', user_id: null, name: 'Uncle', verified_at: null },
  { seat: 4, team: 'B', user_id: 'u4', name: null, verified_at: null },
]

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  game_id: 'g1',
  club_id: 'c1',
  mode: 'normal',
  status: 'finished',
  verified: true,
  winner_team: 'A',
  started_at: '2026-10-19T19:00:00Z',
  finished_at: '2026-10-19T20:00:00Z',
  tournament_match_id: null,
  team_a_total: 2100,
  team_b_total: 1450,
  rounds_played: 7,
  seats: seatsJson,
  player_ids: ['u1', 'u2', 'u4'],
  ...over,
})

describe('num', () => {
  it('coerces numbers and numeric strings', () => {
    expect(num(5)).toBe(5)
    expect(num('0.625')).toBe(0.625)
  })

  it('treats null, empty and garbage as 0', () => {
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('')).toBe(0)
    expect(num('abc')).toBe(0)
  })
})

describe('parseSeats', () => {
  it('sorts by seat and reads verification', () => {
    const seats = parseSeats(seatsJson)
    expect(seats.map((s) => s.seat)).toEqual([1, 2, 3, 4])
    expect(seats[0]).toEqual({ seat: 1, team: 'A', userId: 'u1', name: 'Amal', verified: true })
    expect(seats[2]).toMatchObject({ userId: null, name: 'Uncle', verified: false })
    expect(seats[3]?.name).toBeNull()
  })

  it('returns [] for non-arrays and skips non-objects', () => {
    expect(parseSeats(null)).toEqual([])
    expect(parseSeats({ seat: 1 })).toEqual([])
    expect(parseSeats([1, 'x', null])).toEqual([])
  })
})

describe('badgeOf', () => {
  const seats = parseSeats(seatsJson)

  it('abandoned wins over everything', () => {
    expect(badgeOf('abandoned', 'normal', false, seats)).toBe('abandoned')
  })

  it('verified when the game counts', () => {
    expect(badgeOf('finished', 'normal', true, seats)).toBe('verified')
    expect(badgeOf('finished', 'ghost', true, seats)).toBe('verified')
  })

  it('partly verified when some member seats confirmed a ghost game', () => {
    expect(badgeOf('finished', 'ghost', false, seats)).toBe('partly')
  })

  it('ghost when no member seat confirmed', () => {
    expect(badgeOf('finished', 'ghost', false, parseSeats([{ seat: 1, team: 'A', user_id: 'u1', verified_at: null }]))).toBe('ghost')
  })

  it('ignores guest seats when deciding partly verified', () => {
    expect(badgeOf('finished', 'ghost', false, [{ seat: 1, team: 'A', userId: null, name: 'G', verified: true }])).toBe('ghost')
  })
})

describe('toHistoryItem', () => {
  it('builds a card model with numeric totals', () => {
    const item = toHistoryItem(row({ team_a_total: '2100' as unknown as number, rounds_played: '7' as unknown as number }))
    expect(item).toMatchObject({
      id: 'g1',
      winner: 'A',
      totals: { A: 2100, B: 1450 },
      rounds: 7,
      badge: 'verified',
      ghost: false,
      tournament: false,
    })
  })

  it('flags tournament games and ghost mode', () => {
    expect(toHistoryItem(row({ tournament_match_id: 'm1', mode: 'ghost', verified: false }))).toMatchObject({
      tournament: true,
      ghost: true,
      badge: 'partly',
    })
  })

  it('returns null without an id', () => {
    expect(toHistoryItem(row({ game_id: null }))).toBeNull()
  })
})

describe('team helpers', () => {
  const seats = parseSeats(seatsJson)

  it('lists seats per team', () => {
    expect(seatsOf({ seats }, 'B').map((s) => s.seat)).toEqual([2, 4])
  })

  it('joins names and falls back to the guest label', () => {
    expect(teamLabel(seats, 'A', 'Guest')).toBe('Amal · Uncle')
    expect(teamLabel(seats, 'B', 'Guest')).toBe('Badr · Guest')
  })
})
