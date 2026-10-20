import { describe, expect, it } from 'vitest'
import {
  type H2HRow,
  type LeaderboardRow,
  type PairStatsRow,
  bestPartner,
  num,
  numOrNull,
  rankLeaderboard,
  sortPairs,
  toMyStats,
  toPairs,
  toughestOpponents,
} from './select'

const ME = 'm'

describe('coercion', () => {
  it('num handles strings, nulls and garbage', () => {
    expect(num('0.6250')).toBe(0.625)
    expect(num(null)).toBe(0)
    expect(num('x')).toBe(0)
  })

  it('numOrNull keeps missing values missing', () => {
    expect(numOrNull(null)).toBeNull()
    expect(numOrNull('')).toBeNull()
    expect(numOrNull('12')).toBe(12)
    expect(numOrNull('nope')).toBeNull()
  })
})

describe('toMyStats', () => {
  it('returns null with no row or no games', () => {
    expect(toMyStats(null)).toBeNull()
    expect(toMyStats({ games: 0 } as never)).toBeNull()
  })

  it('coerces every column', () => {
    const s = toMyStats({
      club_id: 'c',
      user_id: ME,
      games: 8,
      wins: 5,
      losses: 2,
      draws: 1,
      win_rate: '0.6250' as unknown as number,
      avg_points_per_game: '1830.5' as unknown as number,
      avg_points_per_round: 260.1,
      biggest_win_margin: null,
      longest_game_rounds: 12,
      cuts: 3,
      cuts_per_game: '0.38' as unknown as number,
      current_streak: 2,
      best_streak: 4,
    })
    expect(s).toEqual({
      games: 8,
      wins: 5,
      losses: 2,
      draws: 1,
      winRate: 0.625,
      avgPerGame: 1830.5,
      avgPerRound: 260.1,
      biggestWinMargin: null,
      longestGame: 12,
      cuts: 3,
      cutsPerGame: 0.38,
      currentStreak: 2,
      bestStreak: 4,
    })
  })
})

const pair = (a: string, b: string, games: number, winRate: number, avg = 1500): PairStatsRow => ({
  club_id: 'c',
  player_a: a,
  player_b: b,
  games,
  wins: Math.round(games * winRate),
  win_rate: winRate,
  avg_score: avg,
})

describe('pairs', () => {
  const rows = [pair('a', 'm', 6, 0.5), pair('m', 'z', 5, 0.8), pair('b', 'm', 4, 1), pair('m', 'y', 12, 0.8), pair('a', 'b', 20, 0.4)]

  it('toPairs skips rows without both players', () => {
    expect(toPairs([...rows, { ...pair('a', 'b', 1, 1), player_b: null }])).toHaveLength(5)
  })

  it('best partner: highest win rate with at least 5 games, more games on ties', () => {
    expect(bestPartner(toPairs(rows), ME)).toEqual({ partnerId: 'y', games: 12, wins: 10, winRate: 0.8 })
  })

  it('best partner: none under the minimum', () => {
    expect(bestPartner(toPairs([pair('b', 'm', 4, 1)]), ME)).toBeNull()
  })

  it('sorts by win rate or by games', () => {
    const p = toPairs(rows)
    expect(sortPairs(p, 'winRate').map((x) => `${x.a}${x.b}`)).toEqual(['bm', 'my', 'mz', 'am', 'ab'])
    expect(sortPairs(p, 'games').map((x) => `${x.a}${x.b}`)).toEqual(['ab', 'my', 'am', 'mz', 'bm'])
  })

  it('does not mutate the input', () => {
    const p = toPairs(rows)
    const before = p.map((x) => x.a)
    sortPairs(p, 'games')
    expect(p.map((x) => x.a)).toEqual(before)
  })
})

const h2h = (opp: string, games: number, winRate: number, user = ME): H2HRow => ({
  club_id: 'c',
  user_id: user,
  opponent_id: opp,
  games,
  wins: Math.round(games * winRate),
  losses: games - Math.round(games * winRate),
  win_rate: winRate,
  point_diff: -100,
})

describe('toughestOpponents', () => {
  it('lowest win rate first, minimum 3 games, top 3, only my rows', () => {
    const rows = [
      h2h('a', 3, 0.33),
      h2h('b', 10, 0.2),
      h2h('c', 2, 0),
      h2h('d', 5, 0.2),
      h2h('e', 4, 0.75),
      h2h('f', 6, 0.9),
      h2h('x', 9, 0, 'other'),
    ]
    expect(toughestOpponents(rows, ME).map((o) => o.opponentId)).toEqual(['b', 'd', 'a'])
  })

  it('coerces string numerics', () => {
    const [o] = toughestOpponents([{ ...h2h('a', 3, 0), games: '3' as unknown as number, win_rate: '0.0000' as unknown as number }], ME)
    expect(o).toMatchObject({ opponentId: 'a', games: 3, winRate: 0, pointDiff: -100 })
  })
})

const lb = (user: string, games: number, winRate: number, diff = 0): LeaderboardRow => ({
  club_id: 'c',
  user_id: user,
  games,
  wins: Math.round(games * winRate),
  win_rate: winRate,
  point_diff: diff,
  eligible: games >= 10,
})

describe('rankLeaderboard', () => {
  it('ranks eligible players by win rate, then games, with shared ranks for ties', () => {
    const { ranked } = rankLeaderboard([lb('a', 10, 0.5), lb('b', 20, 0.5), lb('c', 12, 0.75), lb('d', 20, 0.5), lb('e', 11, 0.1)])
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ['c', 1],
      ['b', 2],
      ['d', 2],
      ['a', 4],
      ['e', 5],
    ])
  })

  it('lists players under 10 games separately, most games first', () => {
    const { ranked, unranked } = rankLeaderboard([lb('a', 9, 1), lb('b', 3, 0), lb('c', 10, 0), { ...lb('z', 4, 1), user_id: null }])
    expect(ranked.map((r) => r.userId)).toEqual(['c'])
    expect(unranked.map((r) => r.userId)).toEqual(['a', 'b'])
  })

  it('coerces numeric strings', () => {
    const { ranked } = rankLeaderboard([{ ...lb('a', 10, 0.5), games: '10' as unknown as number, win_rate: '0.5000' as unknown as number }])
    expect(ranked[0]).toMatchObject({ games: 10, winRate: 0.5, rank: 1 })
  })
})
