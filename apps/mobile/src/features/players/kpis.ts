import { RANKED_MIN_GAMES } from './roster'

/**
 * Club highlights above the Players board: who leads each stat. Pure; tested in kpis.test.ts.
 * A tie goes to the player with fewer games (they got there quicker), then the lower id.
 */
export interface KpiStats {
  readonly user_id: string | null
  readonly games: number | null
  readonly wins?: number | null
  readonly current_streak: number | null
  readonly best_streak: number | null
  readonly cuts: number | null
  readonly biggest_win_margin: number | null
}

export interface Kpi {
  readonly userId: string
  readonly value: number
}

export interface ClubKpis {
  /** Best win % (0..1) among players with at least RANKED_MIN_GAMES games. */
  readonly bestWinRate: Kpi | null
  /** Most wins in a row right now. */
  readonly hotStreak: Kpi | null
  /** Most wins in a row ever. */
  readonly bestStreak: Kpi | null
  readonly mostGames: Kpi | null
  /** Most exact cuts (+100). */
  readonly mostCuts: Kpi | null
  /** Biggest winning margin in one game. */
  readonly biggestWin: Kpi | null
}

export function clubKpis(stats: readonly KpiStats[]): ClubKpis {
  const rows = stats.flatMap((s) => (s.user_id && Number(s.games ?? 0) > 0 ? [{ ...s, id: s.user_id, games: Number(s.games) }] : []))
  const lead = (value: (r: (typeof rows)[number]) => number | null): Kpi | null => {
    let best: { id: string; value: number; games: number } | null = null
    for (const r of rows) {
      const v = value(r)
      if (v === null || !(v > 0)) continue
      if (!best || v > best.value || (v === best.value && (r.games < best.games || (r.games === best.games && r.id < best.id)))) {
        best = { id: r.id, value: v, games: r.games }
      }
    }
    return best ? { userId: best.id, value: best.value } : null
  }
  const num = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))
  return {
    bestWinRate: lead((r) => (r.games >= RANKED_MIN_GAMES ? Number(r.wins ?? 0) / r.games : null)),
    hotStreak: lead((r) => num(r.current_streak)),
    bestStreak: lead((r) => num(r.best_streak)),
    mostGames: lead((r) => r.games),
    mostCuts: lead((r) => num(r.cuts)),
    biggestWin: lead((r) => num(r.biggest_win_margin)),
  }
}
