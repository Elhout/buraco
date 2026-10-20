import type { Team, Views } from '@buraco/shared'

/** One card on the history timeline, built from a v_game_history row. Pure (tested). */

export type HistoryRow = Views<'v_game_history'>

export interface HistorySeat {
  readonly seat: number
  readonly team: Team
  readonly userId: string | null
  /** Null for a guest without a name; the UI shows "Guest". */
  readonly name: string | null
  readonly verified: boolean
}

/** abandoned › verified › partly (some member seats confirmed) › ghost (unverified). */
export type HistoryBadge = 'verified' | 'ghost' | 'partly' | 'abandoned'

export interface HistoryItem {
  readonly id: string
  readonly finishedAt: string | null
  readonly winner: Team | null
  readonly totals: Readonly<Record<Team, number>>
  readonly rounds: number
  readonly seats: readonly HistorySeat[]
  readonly badge: HistoryBadge
  readonly ghost: boolean
  readonly tournament: boolean
}

/** View numerics may arrive as numbers or numeric strings; anything else counts as 0. */
export function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

export function parseSeats(json: unknown): HistorySeat[] {
  if (!Array.isArray(json)) return []
  return json
    .filter(isRecord)
    .map((s) => ({
      seat: num(s.seat),
      team: (s.team === 'B' ? 'B' : 'A') as Team,
      userId: str(s.user_id),
      name: str(s.name),
      verified: str(s.verified_at) !== null,
    }))
    .sort((a, b) => a.seat - b.seat)
}

export function badgeOf(status: string | null, mode: string | null, verified: boolean, seats: readonly HistorySeat[]): HistoryBadge {
  if (status === 'abandoned') return 'abandoned'
  if (verified) return 'verified'
  return mode === 'ghost' && seats.some((s) => s.userId !== null && s.verified) ? 'partly' : 'ghost'
}

export function toHistoryItem(row: HistoryRow): HistoryItem | null {
  if (!row.game_id) return null
  const seats = parseSeats(row.seats)
  const verified = row.verified === true
  return {
    id: row.game_id,
    finishedAt: row.finished_at,
    winner: row.winner_team,
    totals: { A: num(row.team_a_total), B: num(row.team_b_total) },
    rounds: num(row.rounds_played),
    seats,
    badge: badgeOf(row.status, row.mode, verified, seats),
    ghost: row.mode === 'ghost',
    tournament: row.tournament_match_id !== null,
  }
}

export const seatsOf = (item: Pick<HistoryItem, 'seats'>, team: Team): readonly HistorySeat[] => item.seats.filter((s) => s.team === team)

export const teamLabel = (seats: readonly HistorySeat[], team: Team, guest: string): string =>
  seats
    .filter((s) => s.team === team)
    .map((s) => s.name ?? guest)
    .join(' · ')
