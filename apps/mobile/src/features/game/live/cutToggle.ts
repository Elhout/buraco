import type { Team } from '@buraco/shared'

/**
 * The +100 button under a team's score in a live game: one tap adds the exact-cut bonus to this
 * deal, a second tap removes it, and tapping the other team moves it (only one team can cut a
 * deal). Pure; tested in cutToggle.test.ts.
 */
export interface CutLine {
  readonly id: string
  readonly seat: number
  readonly team: Team
}

export interface CutSeat {
  readonly seat: number
  readonly team: Team
  readonly isMe: boolean
}

export interface CutPlan {
  /** Cut lines to remove first. */
  readonly remove: readonly string[]
  /** Seat to credit with the new cut, or null when the tap only removes. */
  readonly add: number | null
}

export function planCutToggle(team: Team, lines: readonly CutLine[], seats: readonly CutSeat[]): CutPlan {
  const mine = lines.filter((l) => l.team === team)
  if (mine.length > 0) return { remove: mine.map((l) => l.id), add: null }
  const teamSeats = seats.filter((s) => s.team === team).sort((a, b) => a.seat - b.seat)
  // Credit me if I'm on that team, otherwise the team's first seat.
  const seat = teamSeats.find((s) => s.isMe)?.seat ?? teamSeats[0]?.seat ?? null
  return { remove: lines.filter((l) => l.team !== team).map((l) => l.id), add: seat }
}
