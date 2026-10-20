import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import type { EventRow } from './events'
import { type HistoryFilters, type HistoryQueryParams, nextPage, pageRange, toQueryParams } from './filters'
import { type HistoryItem, toHistoryItem } from './items'

export interface HistoryPage {
  readonly items: readonly HistoryItem[]
  /** Rows returned by the server, for deciding whether another page exists. */
  readonly rowCount: number
}

export async function fetchHistoryPage(clubId: string, params: HistoryQueryParams, page: number): Promise<HistoryPage> {
  const [from, to] = pageRange(page)
  let query = supabase.from('v_game_history').select('*').eq('club_id', clubId)
  if (params.playerIds.length > 0) query = query.contains('player_ids', [...params.playerIds])
  if (params.since) query = query.gte('finished_at', params.since)
  if (params.verifiedOnly) query = query.eq('verified', true)
  if (params.tournamentOnly) query = query.not('tournament_match_id', 'is', null)
  const { data, error } = await query
    .order('finished_at', { ascending: false, nullsFirst: false })
    .order('game_id', { ascending: false })
    .range(from, to)
  if (error) throw error
  return { items: data.flatMap((row) => toHistoryItem(row) ?? []), rowCount: data.length }
}

/**
 * Club timeline, newest first, 30 per page. Refreshes when any game in the club changes so a
 * game that just finished (or got verified) shows up without pulling.
 */
export function useHistory(clubId: string, filters: HistoryFilters, me: string, seasonStart: string | null) {
  const query = useInfiniteQuery({
    queryKey: qk.history(clubId, { ...filters, seasonStart }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchHistoryPage(clubId, toQueryParams(filters, me, new Date(), seasonStart), pageParam),
    getNextPageParam: (last, pages) => nextPage(last.rowCount, pages.length),
  })
  useRealtimeInvalidate(`history:${clubId}`, [{ table: 'games', filter: `club_id=eq.${clubId}` }], [qk.historyAll(clubId)])
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  return { ...query, items }
}

export const gameEventsKey = (gameId: string) => [...qk.game(gameId), 'events'] as const

/** The game's audit log, oldest first. Invalidated together with the game (shared key prefix). */
export function useGameEvents(gameId: string) {
  return useQuery({
    queryKey: gameEventsKey(gameId),
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at')
      if (error) throw error
      return data
    },
  })
}
