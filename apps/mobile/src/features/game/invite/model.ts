import type { Enums } from '@buraco/shared'

/**
 * Pure rules for the Invite pending screen (no React Native imports, tested with Vitest).
 * The server decides; these only choose what to show and which buttons to offer.
 */

export type InvitePhase = 'waiting' | 'timeUp' | 'live' | 'expired' | 'cancelled' | 'over'

export interface InviteGame {
  readonly status: Enums<'game_status'>
  readonly inviteExpiresAt: string | null
}

export const msLeft = (expiresAt: string | null, now: number): number =>
  expiresAt === null ? 0 : Math.max(0, new Date(expiresAt).getTime() - now)

/**
 * `timeUp` is the gap between the clock reaching zero on the phone and the server's expiry job
 * flipping the game to `expired`: players can no longer accept, but the host can still swap
 * (swap_seat restarts the 10-minute window) or switch to ghost.
 */
export function invitePhase(game: InviteGame, now: number): InvitePhase {
  switch (game.status) {
    case 'live':
      return 'live'
    case 'expired':
      return 'expired'
    case 'abandoned':
      return 'cancelled'
    case 'draft':
    case 'inviting':
      return game.inviteExpiresAt !== null && msLeft(game.inviteExpiresAt, now) === 0 ? 'timeUp' : 'waiting'
    default:
      return 'over'
  }
}

export interface InviteSeat {
  readonly seat: number
  readonly userId: string | null
  readonly inviteStatus: Enums<'invite_status'>
  readonly isMe: boolean
}

/** I can accept or decline while my own seat is still invited and the clock is running. */
export const canRespond = (phase: InvitePhase, mySeat: InviteSeat | null): boolean =>
  phase === 'waiting' && mySeat?.inviteStatus === 'invited'

/** The host may replace anyone who hasn't confirmed (never their own seat). */
export const canSwap = (phase: InvitePhase, isHost: boolean, seat: InviteSeat, hostId: string | null): boolean =>
  isHost &&
  (phase === 'waiting' || phase === 'timeUp') &&
  seat.userId !== null &&
  seat.userId !== hostId &&
  seat.inviteStatus !== 'confirmed'

export const hostCanAct = (phase: InvitePhase, isHost: boolean): boolean => isHost && (phase === 'waiting' || phase === 'timeUp')

export interface Candidate {
  readonly userId: string
  readonly name: string
}

/** Members who could take a seat: not already at this table, alphabetical. */
export function swapCandidates<C extends Candidate>(members: readonly C[], seats: readonly InviteSeat[]): C[] {
  const seated = new Set(seats.flatMap((s) => (s.userId ? [s.userId] : [])))
  return members.filter((m) => !seated.has(m.userId)).sort((a, b) => a.name.localeCompare(b.name))
}

export const confirmedCount = (seats: readonly InviteSeat[]): number => seats.filter((s) => s.inviteStatus === 'confirmed').length
