import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import type { StartRoundArgs } from './draw'
import type { CreateArgs, EntryPayload } from './setup'
import type { MatchResultValue } from './types'

/** Organizer RPCs. The database validates everything; every success refetches the tournament. */
export function useTournamentActions(id: string, clubId: string) {
  const client = useQueryClient()
  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.tournament(id) }),
      client.invalidateQueries({ queryKey: qk.tournaments(clubId) }),
    ])
  }
  const start = useMutation({ mutationFn: () => rpc('start_tournament', { p_tournament_id: id }), onSuccess: refresh })
  const startRound = useMutation({ mutationFn: (args: StartRoundArgs) => rpc('start_round', args), onSuccess: refresh })
  const substitute = useMutation({
    mutationFn: (v: { entryId: string; userId: string }) => rpc('substitute_entry', { p_entry_id: v.entryId, p_user_id: v.userId }),
    onSuccess: refresh,
  })
  const editResult = useMutation({
    mutationFn: (v: { matchId: string; result: MatchResultValue; pointsA: number; pointsB: number; reason: string }) =>
      rpc('edit_match_result', {
        p_match_id: v.matchId,
        p_result: v.result,
        p_points_a: v.pointsA,
        p_points_b: v.pointsB,
        p_reason: v.reason,
      }),
    onSuccess: refresh,
  })
  const close = useMutation({
    mutationFn: (cancel: boolean) => rpc('finish_tournament', { p_tournament_id: id, p_cancel: cancel }),
    onSuccess: refresh,
  })
  return { start, startRound, substitute, editResult, close }
}

/**
 * create_tournament then set_entries. If the entries are refused, the empty draft is cancelled so
 * it does not linger in the list, and the original error is rethrown.
 */
export function useCreateTournament(clubId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (v: { args: CreateArgs; entries: EntryPayload[] }): Promise<string> => {
      const id = await rpc('create_tournament', v.args)
      try {
        await rpc('set_entries', { p_tournament_id: id, p_entries: v.entries })
      } catch (error) {
        await rpc('finish_tournament', { p_tournament_id: id, p_cancel: true }).catch(() => undefined)
        throw error
      }
      return id
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.tournaments(clubId) }),
  })
}
