import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { type PairIds, pairH2HFilter } from './h2h'
import type { H2HRow, LeaderboardRow, PairH2HRow, PairStatsRow, PlayerStatsRow } from './select'

/**
 * Stats are Postgres views over verified games (spec "History and stats"); every query is scoped
 * to the current club and lives under qk.stats(clubId) so one invalidation refreshes them all.
 */

const key = (clubId: string, ...rest: readonly (string | null)[]) => [...qk.stats(clubId), ...rest] as const

/** Refetch every stat when a game in the club changes (finished, verified). */
export function useStatsLive(clubId: string): void {
  useRealtimeInvalidate(`stats:${clubId}`, [{ table: 'games', filter: `club_id=eq.${clubId}` }], [qk.stats(clubId)])
}

export function useMyStats(clubId: string, me: string) {
  return useQuery({
    queryKey: key(clubId, 'player', me),
    queryFn: async (): Promise<PlayerStatsRow | null> => {
      const { data, error } = await supabase.from('v_player_stats').select('*').eq('club_id', clubId).eq('user_id', me).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePairStats(clubId: string) {
  return useQuery({
    queryKey: key(clubId, 'pairs'),
    queryFn: async (): Promise<PairStatsRow[]> => {
      const { data, error } = await supabase.from('v_pair_stats').select('*').eq('club_id', clubId)
      if (error) throw error
      return data
    },
  })
}

export function useMyH2H(clubId: string, me: string) {
  return useQuery({
    queryKey: key(clubId, 'h2h', me),
    queryFn: async (): Promise<H2HRow[]> => {
      const { data, error } = await supabase.from('v_h2h').select('*').eq('club_id', clubId).eq('user_id', me)
      if (error) throw error
      return data
    },
  })
}

export function useLeaderboard(clubId: string) {
  return useQuery({
    queryKey: key(clubId, 'leaderboard'),
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.from('v_leaderboard').select('*').eq('club_id', clubId)
      if (error) throw error
      return data
    },
  })
}

export function usePlayerH2H(clubId: string, first: string | null, second: string | null) {
  return useQuery({
    queryKey: key(clubId, 'h2h-players', first, second),
    enabled: first !== null && second !== null && first !== second,
    queryFn: async (): Promise<H2HRow | null> => {
      const { data, error } = await supabase
        .from('v_h2h')
        .select('*')
        .eq('club_id', clubId)
        .eq('user_id', first!)
        .eq('opponent_id', second!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Both pairs normalized (least, greatest); queries both orientations. */
export function usePairH2H(clubId: string, first: PairIds | null, second: PairIds | null) {
  return useQuery({
    queryKey: key(clubId, 'h2h-pairs', first?.join(':') ?? null, second?.join(':') ?? null),
    enabled: first !== null && second !== null,
    queryFn: async (): Promise<PairH2HRow[]> => {
      const { data, error } = await supabase.from('v_pair_h2h').select('*').eq('club_id', clubId).or(pairH2HFilter(first!, second!))
      if (error) throw error
      return data
    },
  })
}

/** Every player's totals in the club (one row per player with games), for the Players tab. */
export function useClubPlayerStats(clubId: string) {
  return useQuery({
    queryKey: key(clubId, 'players'),
    queryFn: async (): Promise<PlayerStatsRow[]> => {
      const { data, error } = await supabase.from('v_player_stats').select('*').eq('club_id', clubId)
      if (error) throw error
      return data
    },
  })
}
