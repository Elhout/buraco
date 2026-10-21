import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { createGame } from '@/features/game/actions'
import { qk } from '@/lib/queryKeys'
import {
  type DraftIssue,
  EMPTY,
  type GameMode,
  type Player,
  type SeatNo,
  type Slots,
  clearSeat,
  placeInSeat,
  shuffle,
  swapTeams,
  toSeats,
  togglePlayer,
  validateDraft,
  withoutGuests,
} from './draft'

export interface NewGameState {
  slots: Slots
  mode: GameMode
  issues: DraftIssue[]
  /** Guests were removed when switching back to a verified game. */
  guestsDropped: boolean
  toggle: (player: Player) => void
  clear: (seat: SeatNo) => void
  /** Seat a player in one particular seat (from the seat picker). */
  place: (seat: SeatNo, player: Player) => void
  swap: () => void
  reshuffle: () => void
  setMode: (mode: GameMode) => void
  start: () => void
  starting: boolean
  startError: unknown
}

/** Picker state for /game/new. I start in seat 1 (Team A); Start calls create_game. */
export function useNewGame(clubId: string, me: Player & { kind: 'member' }): NewGameState {
  const client = useQueryClient()
  const [slots, setSlots] = useState<Slots>(() => togglePlayer(EMPTY, me))
  // Pick and start is the default (one private club, trusted scorekeepers); invites are optional.
  const [mode, setModeState] = useState<GameMode>('ghost')
  const [guestsDropped, setGuestsDropped] = useState(false)

  const mutation = useMutation({
    mutationFn: () => createGame(clubId, toSeats(slots), mode),
    onSuccess: (gameId) => {
      void client.invalidateQueries({ queryKey: qk.lobby(clubId) })
      router.replace(mode === 'normal' ? `/game/${gameId}/invite` : `/game/${gameId}`)
    },
  })

  const edit = (next: (s: Slots) => Slots): void => {
    setGuestsDropped(false)
    mutation.reset()
    setSlots(next)
  }

  return {
    slots,
    mode,
    issues: validateDraft(slots, mode, me.userId),
    guestsDropped,
    toggle: (player) => edit((s) => togglePlayer(s, player)),
    clear: (seat) => edit((s) => clearSeat(s, seat)),
    place: (seat, player) => edit((s) => placeInSeat(s, seat, player)),
    swap: () => edit(swapTeams),
    reshuffle: () => edit((s) => shuffle(s)),
    setMode: (next) => {
      mutation.reset()
      setModeState(next)
      const hasGuests = slots.some((p) => p?.kind === 'guest')
      if (next === 'normal' && hasGuests) {
        setSlots(withoutGuests(slots))
        setGuestsDropped(true)
      }
    },
    start: () => mutation.mutate(),
    starting: mutation.isPending,
    startError: mutation.error,
  }
}
