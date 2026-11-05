import { describe, expect, it } from 'vitest'
import { type DailyGameRow, dailyBoards, localDay } from './daily'

const TZ = 'Asia/Kuwait' // UTC+3
const row = (game: string, user: string, outcome: 'win' | 'loss', at: string): DailyGameRow => ({
  game_id: game,
  user_id: user,
  outcome,
  finished_at: at,
})

describe('localDay', () => {
  it("uses the club's evening, not UTC", () => {
    expect(localDay('2026-11-05T22:30:00Z', TZ)).toBe('2026-11-06')
    expect(localDay('2026-11-05T20:30:00Z', TZ)).toBe('2026-11-05')
  })
})

describe('dailyBoards', () => {
  const rows = [
    // Nov 5: g1 A (sara, omar) beat B; g2 B (sara, nour) won.
    row('g1', 'sara', 'win', '2026-11-05T18:00:00Z'),
    row('g1', 'omar', 'win', '2026-11-05T18:00:00Z'),
    row('g1', 'nour', 'loss', '2026-11-05T18:00:00Z'),
    row('g1', 'ali', 'loss', '2026-11-05T18:00:00Z'),
    row('g2', 'sara', 'win', '2026-11-05T19:30:00Z'),
    row('g2', 'nour', 'win', '2026-11-05T19:30:00Z'),
    row('g2', 'omar', 'loss', '2026-11-05T19:30:00Z'),
    row('g2', 'ali', 'loss', '2026-11-05T19:30:00Z'),
    // Nov 7: one game, omar and ali won.
    row('g3', 'omar', 'win', '2026-11-07T18:00:00Z'),
    row('g3', 'ali', 'win', '2026-11-07T18:00:00Z'),
    row('g3', 'sara', 'loss', '2026-11-07T18:00:00Z'),
    row('g3', 'nour', 'loss', '2026-11-07T18:00:00Z'),
  ]

  it('only days with games, newest first, with each player won/lost that day', () => {
    const boards = dailyBoards(rows, TZ)
    expect(boards.map((b) => [b.day, b.games])).toEqual([
      ['2026-11-07', 1],
      ['2026-11-05', 2],
    ])
    expect(boards[1]!.players).toEqual([
      { userId: 'sara', wins: 2, losses: 0 },
      { userId: 'nour', wins: 1, losses: 1 },
      { userId: 'omar', wins: 1, losses: 1 },
      { userId: 'ali', wins: 0, losses: 2 },
    ])
  })

  it('the champion has the most wins; level champions share the day', () => {
    const boards = dailyBoards(rows, TZ)
    expect(boards[1]!.champions).toEqual(['sara'])
    expect(boards[0]!.champions).toEqual(['ali', 'omar'])
  })

  it('ties on wins go to fewer losses', () => {
    const boards = dailyBoards(
      [
        row('g1', 'a', 'win', '2026-11-05T18:00:00Z'),
        row('g2', 'a', 'loss', '2026-11-05T19:00:00Z'),
        row('g1', 'b', 'win', '2026-11-05T18:00:00Z'),
      ],
      TZ,
    )
    expect(boards[0]!.champions).toEqual(['b'])
  })

  it('skips rows without a date or player', () => {
    expect(dailyBoards([{ game_id: 'g', user_id: null, outcome: 'win', finished_at: '2026-11-05T18:00:00Z' }], TZ)).toEqual([])
  })
})
