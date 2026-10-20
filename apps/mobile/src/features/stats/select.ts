import type { Views } from '@buraco/shared'

/**
 * Stats selection and ranking over the Postgres views. Pure (tested). View numerics may arrive
 * as numbers or numeric strings, so every value goes through num().
 */

export type PlayerStatsRow = Views<'v_player_stats'>
export type PairStatsRow = Views<'v_pair_stats'>
export type H2HRow = Views<'v_h2h'>
export type PairH2HRow = Views<'v_pair_h2h'>
export type LeaderboardRow = Views<'v_leaderboard'>

export const BEST_PARTNER_MIN_GAMES = 5
export const TOUGH_OPPONENT_MIN_GAMES = 3
export const TOUGH_OPPONENT_COUNT = 3
export const LEADERBOARD_MIN_GAMES = 10

export function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export interface MyStats {
  readonly games: number
  readonly wins: number
  readonly losses: number
  readonly draws: number
  readonly winRate: number
  readonly avgPerGame: number
  readonly avgPerRound: number
  readonly biggestWinMargin: number | null
  readonly longestGame: number
  readonly cuts: number
  readonly cutsPerGame: number
  readonly currentStreak: number
  readonly bestStreak: number
}

export function toMyStats(row: PlayerStatsRow | null): MyStats | null {
  if (!row || num(row.games) === 0) return null
  return {
    games: num(row.games),
    wins: num(row.wins),
    losses: num(row.losses),
    draws: num(row.draws),
    winRate: num(row.win_rate),
    avgPerGame: num(row.avg_points_per_game),
    avgPerRound: num(row.avg_points_per_round),
    biggestWinMargin: numOrNull(row.biggest_win_margin),
    longestGame: num(row.longest_game_rounds),
    cuts: num(row.cuts),
    cutsPerGame: num(row.cuts_per_game),
    currentStreak: num(row.current_streak),
    bestStreak: num(row.best_streak),
  }
}

/** Higher win rate first, then more games. */
const byRateThenGames = (a: { winRate: number; games: number }, b: { winRate: number; games: number }): number =>
  b.winRate - a.winRate || b.games - a.games

export interface Pair {
  readonly a: string
  readonly b: string
  readonly games: number
  readonly wins: number
  readonly winRate: number
  readonly avgScore: number
}

export function toPairs(rows: readonly PairStatsRow[]): Pair[] {
  return rows.flatMap((r) =>
    r.player_a && r.player_b
      ? [{ a: r.player_a, b: r.player_b, games: num(r.games), wins: num(r.wins), winRate: num(r.win_rate), avgScore: num(r.avg_score) }]
      : [],
  )
}

export type PairSort = 'winRate' | 'games'

export function sortPairs(pairs: readonly Pair[], by: PairSort): Pair[] {
  const byGames = (a: Pair, b: Pair): number => b.games - a.games || b.winRate - a.winRate
  return [...pairs].sort(by === 'games' ? byGames : byRateThenGames)
}

export interface Partner {
  readonly partnerId: string
  readonly games: number
  readonly wins: number
  readonly winRate: number
}

/** Highest win rate together, minimum 5 games (spec). */
export function bestPartner(pairs: readonly Pair[], me: string): Partner | null {
  const mine = pairs
    .filter((p) => (p.a === me || p.b === me) && p.games >= BEST_PARTNER_MIN_GAMES)
    .map((p) => ({ partnerId: p.a === me ? p.b : p.a, games: p.games, wins: p.wins, winRate: p.winRate }))
    .sort(byRateThenGames)
  return mine[0] ?? null
}

export interface Opponent {
  readonly opponentId: string
  readonly games: number
  readonly wins: number
  readonly losses: number
  readonly winRate: number
  readonly pointDiff: number
}

/** My lowest win rates against an opponent (minimum 3 games), more games first on ties; top 3. */
export function toughestOpponents(rows: readonly H2HRow[], me: string): Opponent[] {
  return rows
    .flatMap((r) =>
      r.user_id === me && r.opponent_id && num(r.games) >= TOUGH_OPPONENT_MIN_GAMES
        ? [
            {
              opponentId: r.opponent_id,
              games: num(r.games),
              wins: num(r.wins),
              losses: num(r.losses),
              winRate: num(r.win_rate),
              pointDiff: num(r.point_diff),
            },
          ]
        : [],
    )
    .sort((a, b) => a.winRate - b.winRate || b.games - a.games)
    .slice(0, TOUGH_OPPONENT_COUNT)
}

export interface Standing {
  readonly userId: string
  readonly games: number
  readonly wins: number
  readonly winRate: number
  readonly pointDiff: number
}

export interface RankedStanding extends Standing {
  /** Competition ranking: equal win rate and games share a rank (1, 1, 3). */
  readonly rank: number
}

export interface Leaderboard {
  readonly ranked: readonly RankedStanding[]
  /** Under 10 games: listed separately, most games first. */
  readonly unranked: readonly Standing[]
}

export function rankLeaderboard(rows: readonly LeaderboardRow[]): Leaderboard {
  const all: Standing[] = rows.flatMap((r) =>
    r.user_id
      ? [{ userId: r.user_id, games: num(r.games), wins: num(r.wins), winRate: num(r.win_rate), pointDiff: num(r.point_diff) }]
      : [],
  )
  const eligible = all.filter((s) => s.games >= LEADERBOARD_MIN_GAMES).sort(byRateThenGames)
  const ranked = eligible.map((s, i) => {
    const firstTie = eligible.findIndex((o) => o.winRate === s.winRate && o.games === s.games)
    return { ...s, rank: (firstTie === -1 ? i : firstTie) + 1 }
  })
  const unranked = all.filter((s) => s.games < LEADERBOARD_MIN_GAMES).sort((a, b) => b.games - a.games || b.winRate - a.winRate)
  return { ranked, unranked }
}
