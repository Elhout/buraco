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
