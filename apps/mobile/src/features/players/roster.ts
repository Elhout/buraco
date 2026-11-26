/**
 * The Players tab list: every club member with games, wins and losses. Pure; tested in
 * roster.test.ts.
 *
 * Ranked by win % among players with at least RANKED_MIN_GAMES games (ties: more games, then
 * name). Players with fewer games are "new": listed after the ranked ones, most games first.
 * Members without a game come last.
 */
export const RANKED_MIN_GAMES = 5

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
  /** wins / games (0..1); 0 before the first game. */
  readonly winRate: number
  /** Has played, but fewer than RANKED_MIN_GAMES games: not ranked yet. */
  readonly isNew: boolean
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

const tier = (r: { games: number; isNew: boolean }): number => (r.games === 0 ? 2 : r.isNew ? 1 : 0)

export function buildRoster<M extends RosterMember>(members: readonly M[], stats: readonly RosterStats[], locale: string): RosterRow<M>[] {
  const byId = new Map(stats.flatMap((s) => (s.user_id ? [[s.user_id, s] as const] : [])))
  return members
    .map((m) => {
      const s = byId.get(m.userId)
      const games = Number(s?.games ?? 0)
      const wins = Number(s?.wins ?? 0)
      const winRate = games === 0 ? 0 : wins / games
      return { ...m, games, wins, losses: Number(s?.losses ?? 0), winRate, isNew: games > 0 && games < RANKED_MIN_GAMES }
    })
    .sort((a, b) => {
      const byTier = tier(a) - tier(b)
      if (byTier !== 0) return byTier
      const primary = tier(a) === 1 ? b.games - a.games || b.winRate - a.winRate : b.winRate - a.winRate || b.games - a.games
      return primary || a.name.localeCompare(b.name, locale)
    })
}
