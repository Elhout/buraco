import type { NewSeat } from './actions'
import type { SeatView } from './model'

/** The same table again: every seat on the same team, members by account, guests by name. Pure (tested). */
export function rematchSeats(seats: readonly SeatView[]): NewSeat[] {
  return [...seats]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => ({
      seat: s.seat as NewSeat['seat'],
      team: s.team,
      ...(s.userId ? { userId: s.userId } : { guestName: s.name }),
    }))
}
