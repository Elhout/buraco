import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { type RealtimeStatus, useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { type EntryRowWithProfile, normalizeEntries, normalizeMatches } from './model'
import type { EventRow, TournamentData, TournamentRow } from './types'

export async function fetchTournaments(clubId: string): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('club_id', clubId)
    .order('starts_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** The club's tournaments, live. */
export function useTournaments(clubId: string) {
  const query = useQuery({ queryKey: qk.tournaments(clubId), queryFn: () => fetchTournaments(clubId) })
  const realtime = useRealtimeInvalidate(
    `tournaments:${clubId}`,
    [{ table: 'tournaments', filter: `club_id=eq.${clubId}` }],
    [qk.tournaments(clubId)],
  )
  return { ...query, realtime }
}

export async function fetchTournament(id: string): Promise<TournamentData> {
  const [tournament, entries, rounds, matches, events] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase.from('tournament_entries').select('id, user_id, guest_name, pair_id, seed, profiles(display_name)').eq('tournament_id', id),
    supabase.from('tournament_rounds').select('*').eq('tournament_id', id).order('round_no'),
    supabase.from('v_tournament_matches').select('*').eq('tournament_id', id).order('round_no').order('table_no'),
    supabase.from('tournament_events').select('id, type, actor_id, payload, created_at').eq('tournament_id', id),
  ])
  for (const r of [tournament, entries, rounds, matches, events]) if (r.error) throw r.error
  return {
    tournament: tournament.data as TournamentRow,
    entries: normalizeEntries((entries.data ?? []) as EntryRowWithProfile[]),
    rounds: rounds.data ?? [],
    matches: normalizeMatches(matches.data ?? []),
    events: (events.data ?? []).map((e): EventRow => ({
      id: e.id,
      type: e.type,
      actorId: e.actor_id,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  }
}

export interface UseTournamentResult {
  readonly data: TournamentData | undefined
  readonly isPending: boolean
  readonly error: unknown
  readonly refetch: () => Promise<unknown>
  readonly isRefetching: boolean
  readonly realtime: RealtimeStatus
}

/**
 * One tournament, live. tournament_matches and rounds have no tournament_id column, so they are
 * subscribed unfiltered (RLS limits events to my clubs); games are filtered to the club.
 * Live scores come from `rounds`, watched only while a round is being played.
 */
export function useTournament(id: string, clubId: string): UseTournamentResult {
  const query = useQuery({ queryKey: qk.tournament(id), queryFn: () => fetchTournament(id) })
  const playing = (query.data?.rounds ?? []).some((r) => r.status === 'live')
  const realtime = useRealtimeInvalidate(
    `tournament:${id}:${playing ? 'live' : 'idle'}`,
    [
      { table: 'tournaments', filter: `id=eq.${id}` },
      { table: 'tournament_rounds', filter: `tournament_id=eq.${id}` },
      { table: 'tournament_matches' },
      { table: 'tournament_events', filter: `tournament_id=eq.${id}` },
      { table: 'games', filter: `club_id=eq.${clubId}` },
      ...(playing ? [{ table: 'rounds' }] : []),
    ],
    [qk.tournament(id)],
  )
  return {
    data: query.data,
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
    realtime,
  }
}
