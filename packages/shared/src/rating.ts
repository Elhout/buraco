/**
 * Club ranking. Pure; tested in rating.test.ts.
 *
 * Adjusted win rate: every player is counted as if they had also played RATING_PRIOR_GAMES games
 * at 50%. Newcomers are ranked from their first game, a short lucky streak can't top the board, and
 * a long record barely moves. A draw counts as half a win.
 */
export const RATING_PRIOR_GAMES = 10

export const adjustedWinRate = (wins: number, games: number, draws = 0): number =>
  (wins + draws / 2 + RATING_PRIOR_GAMES / 2) / (games + RATING_PRIOR_GAMES)

/**
 * Elo for pairs. Everyone starts at ELO_START. A team's strength is its two players' average
 * (a guest counts as ELO_START and is never rated). After a game each player moves by
 * ELO_K × (result − expected), where result is 1 for a win, ½ for a draw and 0 for a loss, and
 * expected comes from the gap between the two teams. Beating a stronger pair earns more than
 * beating a weaker one. Mirrored by public.club_ratings in Postgres; the two must agree.
 */
export const ELO_START = 1500
export const ELO_K = 32
/** Below this many games a rating is shown as provisional. */
export const ELO_PROVISIONAL_GAMES = 5

export interface RatedGame {
  /** Seated player ids per team; null for a guest. */
  readonly teamA: readonly (string | null)[]
  readonly teamB: readonly (string | null)[]
  /** null for a draw. */
  readonly winner: 'A' | 'B' | null
}

export interface Rating {
  readonly rating: number
  readonly games: number
}

/** Chance that a team rated `mine` beats a team rated `theirs`. */
export const eloExpected = (mine: number, theirs: number): number => 1 / (1 + 10 ** ((theirs - mine) / 400))

/** Replays games oldest first and returns every rated player's rating and game count. */
export function rateGames(games: readonly RatedGame[]): Map<string, Rating> {
  const ratings = new Map<string, Rating>()
  const ratingOf = (id: string | null): number => (id ? (ratings.get(id)?.rating ?? ELO_START) : ELO_START)
  const strength = (team: readonly (string | null)[]): number =>
    team.length === 0 ? ELO_START : team.reduce((sum, id) => sum + ratingOf(id), 0) / team.length
  for (const g of games) {
    const a = strength(g.teamA)
    const b = strength(g.teamB)
    const resultA = g.winner === 'A' ? 1 : g.winner === 'B' ? 0 : 0.5
    const deltaA = ELO_K * (resultA - eloExpected(a, b))
    const apply = (team: readonly (string | null)[], delta: number): void => {
      for (const id of team) {
        if (!id) continue
        const r = ratings.get(id) ?? { rating: ELO_START, games: 0 }
        ratings.set(id, { rating: r.rating + delta, games: r.games + 1 })
      }
    }
    apply(g.teamA, deltaA)
    apply(g.teamB, -deltaA)
  }
  return ratings
}
