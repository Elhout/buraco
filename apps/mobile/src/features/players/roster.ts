import { ELO_PROVISIONAL_GAMES, ELO_START, adjustedWinRate } from '@buraco/shared'

/**
 * The Players tab list: every club member with games, wins and losses, best first. Pure; tested in
 * roster.test.ts.
 */
export interface RosterMember {
  readonly userId: string
  readonly name: string
}

export interface RosterStats {
  readonly user_id: string | null
  readonly games: number | null
  readonly wins: number | null
  readonly losses?: number | null
  readonly draws?: number | null
}

export type RosterRow<M extends RosterMember = RosterMember> = M & {
  readonly games: number
  readonly wins: number
  readonly losses: number
  /** Adjusted win rate (0..1), 50% before the first game. */
  readonly score: number
  /** Elo rating (rounded); null before the first game. */
  readonly rating: number | null
  /** Too few games for the rating to be settled yet. */
  readonly provisional: boolean
}

/** Case- and accent-insensitive: "sam" finds "Samy", "zoe" finds "Zoë"; an empty query matches all. */
export function matchesName(name: string, query: string): boolean {
  const fold = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const q = fold(query)
  return q === '' || fold(name).includes(q)
}

/**
 * Highest Elo rating first (see rateGames); while ratings are loading, best adjusted win rate.
 * Ties go to more games (the surer record), then name; players with no games last.
 */
export function buildRoster<M extends RosterMember>(
  members: readonly M[],
  stats: readonly RosterStats[],
  locale: string,
  ratings?: ReadonlyMap<string, number>,
): RosterRow<M>[] {
  const byId = new Map(stats.flatMap((s) => (s.user_id ? [[s.user_id, s] as const] : [])))
  return members
    .map((m) => {
      const s = byId.get(m.userId)
      const games = Number(s?.games ?? 0)
      const wins = Number(s?.wins ?? 0)
      const score = adjustedWinRate(wins, games, Number(s?.draws ?? 0))
      const rating = games === 0 ? null : Math.round(ratings?.get(m.userId) ?? ELO_START)
      return { ...m, games, wins, losses: Number(s?.losses ?? 0), score, rating, provisional: games < ELO_PROVISIONAL_GAMES }
    })
    .sort(
      (a, b) =>
        Number(a.games === 0) - Number(b.games === 0) ||
        (ratings ? (b.rating ?? 0) - (a.rating ?? 0) : 0) ||
        b.score - a.score ||
        b.games - a.games ||
        a.name.localeCompare(b.name, locale),
    )
}
