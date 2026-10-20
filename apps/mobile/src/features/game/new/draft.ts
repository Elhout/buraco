import type { Enums, Team } from '@buraco/shared'

/**
 * Pure state for the New game picker. Four seats; the server expects Team A in seats 1 & 3 and
 * Team B in seats 2 & 4 (create_game). Index i of `slots` is seat i + 1.
 */

export type GameMode = Enums<'game_mode'>
export type SeatNo = 1 | 2 | 3 | 4

export type Player =
  { readonly kind: 'member'; readonly userId: string; readonly name: string } | { readonly kind: 'guest'; readonly name: string }
export type Slots = readonly [Player | null, Player | null, Player | null, Player | null]

export const EMPTY: Slots = [null, null, null, null]
export const TEAM_SEATS: Readonly<Record<Team, readonly [SeatNo, SeatNo]>> = { A: [1, 3], B: [2, 4] }
/** Tap order: fill my team first (I'm seat 1), then the opponents. */
export const FILL_ORDER: readonly SeatNo[] = [1, 3, 2, 4]
export const GUEST_NAME_MAX = 40

export const teamOfSeat = (seat: SeatNo): Team => (seat % 2 === 1 ? 'A' : 'B')
const at = (slots: Slots, seat: SeatNo): Player | null => slots[seat - 1] ?? null

const withSeat = (slots: Slots, seat: SeatNo, player: Player | null): Slots => {
  const next = [...slots] as [Player | null, Player | null, Player | null, Player | null]
  next[seat - 1] = player
  return next
}

export const samePlayer = (a: Player, b: Player): boolean =>
  a.kind === 'member' && b.kind === 'member'
    ? a.userId === b.userId
    : a.kind === 'guest' && b.kind === 'guest' && a.name.trim().toLowerCase() === b.name.trim().toLowerCase()

export const seatOf = (slots: Slots, player: Player): SeatNo | null => {
  const i = slots.findIndex((p) => p !== null && samePlayer(p, player))
  return i < 0 ? null : ((i + 1) as SeatNo)
}

export const filledCount = (slots: Slots): number => slots.filter((p) => p !== null).length
export const nextFreeSeat = (slots: Slots): SeatNo | null => FILL_ORDER.find((s) => at(slots, s) === null) ?? null

/** Tapping a member: seats them in the next free slot, or frees their seat if already placed. */
export function togglePlayer(slots: Slots, player: Player): Slots {
  const current = seatOf(slots, player)
  if (current !== null) return withSeat(slots, current, null)
  const free = nextFreeSeat(slots)
  return free === null ? slots : withSeat(slots, free, player)
}

export const clearSeat = (slots: Slots, seat: SeatNo): Slots => withSeat(slots, seat, null)

/** Team A ↔ Team B: partners stay together. */
export const swapTeams = (slots: Slots): Slots => [slots[1], slots[0], slots[3], slots[2]]

/** Random seating of whoever is placed (Fisher–Yates). `random` is injectable for tests. */
export function shuffle(slots: Slots, random: () => number = Math.random): Slots {
  const next = [...slots] as [Player | null, Player | null, Player | null, Player | null]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
  }
  return next
}

/** Leaving ghost mode drops guests (normal games are members only). */
export const withoutGuests = (slots: Slots): Slots => slots.map((p) => (p?.kind === 'guest' ? null : p)) as unknown as Slots

/** Seats fix the teams (1 & 3 vs 2 & 4), so four filled seats always means two per team. */
export type DraftIssue = 'needFour' | 'duplicate' | 'guestsNeedGhost' | 'hostMustPlay' | 'guestName'

export function validateDraft(slots: Slots, mode: GameMode, hostId: string): DraftIssue[] {
  const issues: DraftIssue[] = []
  const players = slots.filter((p): p is Player => p !== null)
  if (players.length !== 4) issues.push('needFour')
  if (players.some((p, i) => players.findIndex((q) => samePlayer(p, q)) !== i)) issues.push('duplicate')
  const guests = players.filter((p) => p.kind === 'guest')
  if (guests.some((g) => g.name.trim().length === 0 || g.name.trim().length > GUEST_NAME_MAX)) issues.push('guestName')
  if (mode === 'normal' && guests.length > 0) issues.push('guestsNeedGhost')
  if (mode === 'normal' && !players.some((p) => p.kind === 'member' && p.userId === hostId)) issues.push('hostMustPlay')
  return issues
}

export interface DraftSeat {
  seat: SeatNo
  team: Team
  userId?: string
  guestName?: string
}

/** Seats for createGame (features/game/actions). Call only when validateDraft returns no issues. */
export function toSeats(slots: Slots): DraftSeat[] {
  return ([1, 2, 3, 4] as const).flatMap((seat) => {
    const p = at(slots, seat)
    if (!p) return []
    const base = { seat, team: teamOfSeat(seat) }
    return [p.kind === 'member' ? { ...base, userId: p.userId } : { ...base, guestName: p.name.trim() }]
  })
}

/** Normalises a typed guest name; null when it can't be used. */
export function guestFrom(raw: string, slots: Slots): Player | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > GUEST_NAME_MAX) return null
  const guest: Player = { kind: 'guest', name }
  return seatOf(slots, guest) === null ? guest : null
}
