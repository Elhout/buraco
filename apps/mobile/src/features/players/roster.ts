/**
 * The Players tab list: every club member with games and wins, best first. Pure; tested in
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
}

export type RosterRow<M extends RosterMember = RosterMember> = M & {
  readonly games: number
  readonly wins: number
}

/** Most wins first, then fewer games (better rate), then name; players with no games last. */
export function buildRoster<M extends RosterMember>(members: readonly M[], stats: readonly RosterStats[], locale: string): RosterRow<M>[] {
  const byId = new Map(stats.flatMap((s) => (s.user_id ? [[s.user_id, s] as const] : [])))
  return members
    .map((m) => ({ ...m, games: Number(byId.get(m.userId)?.games ?? 0), wins: Number(byId.get(m.userId)?.wins ?? 0) }))
    .sort(
      (a, b) =>
        b.wins - a.wins || Number(a.games === 0) - Number(b.games === 0) || a.games - b.games || a.name.localeCompare(b.name, locale),
    )
}
