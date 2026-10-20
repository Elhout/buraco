import type { Enums, Team } from '@buraco/shared'
import { enqueueRound } from '@/lib/outbox'
import type { PinResult } from '@/lib/pin'
import { rpc, rpcWithPin } from '@/lib/rpc'

/**
 * Every game write goes through a database function (docs/SPEC.md: the app never computes a
 * result it uploads). Thin, typed wrappers so screens never spell RPC names or argument keys.
 */

export interface NewSeat {
  seat: 1 | 2 | 3 | 4
  team: Team
  userId?: string
  guestName?: string
}

export const createGame = (clubId: string, seats: readonly NewSeat[], mode: Enums<'game_mode'>): Promise<string> =>
  rpc('create_game', {
    p_club_id: clubId,
    p_mode: mode,
    p_seats: seats.map((s) => ({
      seat: s.seat,
      team: s.team,
      ...(s.userId ? { user_id: s.userId } : {}),
      ...(s.guestName ? { guest_name: s.guestName } : {}),
    })),
  })

export const acceptInvite = (gameId: string, pin: string): Promise<PinResult> =>
  rpcWithPin('respond_invite', { p_game_id: gameId, p_accept: true, p_pin: pin })

export const declineInvite = (gameId: string): Promise<unknown> => rpc('respond_invite', { p_game_id: gameId, p_accept: false })

export const swapSeat = (gameId: string, seat: number, userId: string): Promise<unknown> =>
  rpc('swap_seat', { p_game_id: gameId, p_seat: seat, p_user_id: userId })

export const switchToGhost = (gameId: string): Promise<unknown> => rpc('switch_to_ghost', { p_game_id: gameId })
export const cancelGame = (gameId: string): Promise<unknown> => rpc('cancel_game', { p_game_id: gameId })

export const addCut = (gameId: string, seat: number): Promise<string> => rpc('add_cut', { p_game_id: gameId, p_seat: seat })
export const removeCut = (lineId: string): Promise<unknown> => rpc('remove_cut', { p_line_id: lineId })

/** Saved to the outbox first, so a round entered with no signal is sent when it returns. */
export const submitRound = (gameId: string, teamA: number, teamB: number, cutSeats: readonly number[] = []): Promise<string> =>
  enqueueRound({ gameId, teamA, teamB, cutSeats })

/** PIN is omitted in ghost games (single-tap confirmation). */
export const confirmRound = (roundId: string, pin?: string): Promise<PinResult> =>
  rpcWithPin('confirm_round', pin ? { p_round_id: roundId, p_pin: pin } : { p_round_id: roundId })

export const disputeRound = (roundId: string): Promise<unknown> => rpc('dispute_round', { p_round_id: roundId })

export const confirmResult = (gameId: string, pin?: string): Promise<PinResult> =>
  rpcWithPin('confirm_result', pin ? { p_game_id: gameId, p_pin: pin } : { p_game_id: gameId })

export const requestUndo = (gameId: string): Promise<unknown> => rpc('request_undo', { p_game_id: gameId })

export const approveUndo = (gameId: string, pin: string): Promise<PinResult> =>
  rpcWithPin('respond_undo', { p_game_id: gameId, p_approve: true, p_pin: pin })

export const rejectUndo = (gameId: string): Promise<unknown> => rpc('respond_undo', { p_game_id: gameId, p_approve: false })

export const reassignScorekeeper = (gameId: string, seat: number): Promise<unknown> =>
  rpc('reassign_scorekeeper', { p_game_id: gameId, p_seat: seat })

export const abandonGame = (gameId: string, pin?: string): Promise<PinResult> =>
  rpcWithPin('abandon_game', pin ? { p_game_id: gameId, p_pin: pin } : { p_game_id: gameId })

export const verifyGhostSeat = (gameId: string, pin: string): Promise<PinResult> =>
  rpcWithPin('verify_ghost_seat', { p_game_id: gameId, p_pin: pin })
