/**
 * Daily champions: the club's counted games grouped by the day they finished (only days with
 * games), each player's wins and losses that day, and the day's champion. Pure (tested).
 */

export interface DailyGameRow {
  readonly game_id: string | null
  readonly user_id: string | null
  readonly outcome: string | null
  readonly finished_at: string | null
}

export interface DailyPlayer {
  readonly userId: string
  readonly wins: number
  readonly losses: number
}

export interface DailyBoard {
  /** Local calendar day, YYYY-MM-DD. */
  readonly day: string
  readonly games: number
  /** Most wins first, then fewer losses. */
  readonly players: readonly DailyPlayer[]
  /** Most wins (ties: fewer losses); several when still level. Empty on a day without a win. */
  readonly champions: readonly string[]
}

/** YYYY-MM-DD in the phone's time zone (or `timeZone`, for tests): a late game counts that evening. */
export const localDay = (iso: string, timeZone?: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(
    new Date(iso),
  )
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function dailyBoards(rows: readonly DailyGameRow[], timeZone?: string): DailyBoard[] {
  const days = new Map<string, { games: Set<string>; players: Map<string, { wins: number; losses: number }> }>()
  for (const r of rows) {
    if (!r.finished_at || !r.user_id || !r.game_id) continue
    const key = localDay(r.finished_at, timeZone)
    const day = days.get(key) ?? { games: new Set<string>(), players: new Map() }
    days.set(key, day)
    day.games.add(r.game_id)
    const p = day.players.get(r.user_id) ?? { wins: 0, losses: 0 }
    if (r.outcome === 'win') p.wins += 1
    else if (r.outcome === 'loss') p.losses += 1
    day.players.set(r.user_id, p)
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, d]) => {
      const players = [...d.players.entries()]
        .map(([userId, p]) => ({ userId, ...p }))
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.userId.localeCompare(b.userId))
      const top = players[0]
      const champions =
        top && top.wins > 0 ? players.filter((p) => p.wins === top.wins && p.losses === top.losses).map((p) => p.userId) : []
      return { day, games: d.games.size, players, champions }
    })
}
