import { describe, expect, it } from 'vitest'
import { clubKpis } from './kpis'

const stats = [
  { user_id: 'a', games: 40, wins: 25, current_streak: 0, best_streak: 6, cuts: 12, biggest_win_margin: 1400 },
  { user_id: 'b', games: 12, wins: 9, current_streak: 4, best_streak: 6, cuts: 3, biggest_win_margin: 2100 },
  { user_id: 'c', games: 25, wins: 8, current_streak: 1, best_streak: 2, cuts: 12, biggest_win_margin: null },
]

describe('clubKpis', () => {
  it('picks the leader of each highlight; a tie goes to fewer games (did it quicker)', () => {
    const k = clubKpis(stats)
    expect(k.bestWinRate).toEqual({ userId: 'b', value: 0.75 })
    expect(k.hotStreak).toEqual({ userId: 'b', value: 4 })
    expect(k.bestStreak).toEqual({ userId: 'b', value: 6 })
    expect(k.mostGames).toEqual({ userId: 'a', value: 40 })
    expect(k.mostCuts).toEqual({ userId: 'c', value: 12 })
    expect(k.biggestWin).toEqual({ userId: 'b', value: 2100 })
  })

  it('leaves out a highlight nobody has yet', () => {
    const k = clubKpis([{ user_id: 'a', games: 2, wins: 0, current_streak: 0, best_streak: 0, cuts: 0, biggest_win_margin: null }])
    expect(k).toEqual({
      bestWinRate: null,
      hotStreak: null,
      bestStreak: null,
      mostGames: { userId: 'a', value: 2 },
      mostCuts: null,
      biggestWin: null,
    })
    expect(clubKpis([]).mostGames).toBeNull()
    // 3 wins from 3 games is not enough games for the best win % card.
    expect(
      clubKpis([{ user_id: 'a', games: 3, wins: 3, current_streak: 3, best_streak: 3, cuts: 0, biggest_win_margin: 500 }]).bestWinRate,
    ).toBeNull()
  })
})
