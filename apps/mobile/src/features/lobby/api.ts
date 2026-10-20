import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { ACTIVE_STATUSES, type LobbyGame, type LobbyGameRow, type TotalsRow, buildLobby } from './model'

/** Finished ghost games where my seat still waits for my PIN. Lives under the lobby key so lobby invalidation refreshes it. */
export const toVerifyKey = (clubId: string, userId: string) => [...qk.lobby(clubId), 'toVerify', userId] as const

const GAME_COLUMNS =
  'id, status, mode, host_id, invite_expires_at, created_at, game_seats(seat, team, user_id, guest_name, invite_status, profiles(display_name, avatar_url))'

export interface LobbyData {
  rows: LobbyGameRow[]
  totals: TotalsRow[]
}

export async function fetchLobby(clubId: string): Promise<LobbyData> {
  const games = await supabase
    .from('games')
    .select(GAME_COLUMNS)
    .eq('club_id', clubId)
    .in('status', [...ACTIVE_STATUSES])
    .order('created_at', { ascending: false })
  if (games.error) throw games.error
  const rows = games.data as unknown as LobbyGameRow[]
  if (rows.length === 0) return { rows, totals: [] }
  const totals = await supabase
    .from('v_game_totals')
    .select('game_id, team_a_total, team_b_total, rounds_played')
    .in(
      'game_id',
      rows.map((r) => r.id),
    )
  if (totals.error) throw totals.error
  return { rows, totals: totals.data }
}

export interface GhostToVerify {
  gameId: string
  finishedAt: string | null
}

export async function fetchToVerify(clubId: string, userId: string): Promise<GhostToVerify[]> {
  const { data, error } = await supabase
    .from('game_seats')
    .select('game_id, games!inner(club_id, status, mode, finished_at)')
    .eq('user_id', userId)
    .is('verified_at', null)
    .eq('games.club_id', clubId)
    .eq('games.status', 'finished')
    .eq('games.mode', 'ghost')
    // Trusted start-now games already count; nothing to confirm.
    .eq('games.verified', false)
  if (error) throw error
  const rows = data as unknown as { game_id: string; games: { finished_at: string | null } | null }[]
  return rows
    .map((r) => ({ gameId: r.game_id, finishedAt: r.games?.finished_at ?? null }))
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
}

export interface UseLobbyResult {
  games: LobbyGame[]
  toVerify: GhostToVerify[]
  isPending: boolean
  isRefetching: boolean
  error: unknown
  refetch: () => void
}

/**
 * Spec "Who is playing now": games in (inviting, live) for this club, live through Postgres
 * Changes. Rounds are watched too so the scores on the cards move as rounds are confirmed.
 */
export function useLobby(clubId: string, userId: string): UseLobbyResult {
  const { t } = useTranslation()
  const lobby = useQuery({ queryKey: qk.lobby(clubId), queryFn: () => fetchLobby(clubId) })
  const verify = useQuery({ queryKey: toVerifyKey(clubId, userId), queryFn: () => fetchToVerify(clubId, userId) })
  useRealtimeInvalidate(
    `lobby:${clubId}`,
    [
      { table: 'games', filter: `club_id=eq.${clubId}` },
      // game_seats and rounds carry no club_id; RLS limits events to my clubs' games.
      { table: 'game_seats' },
      { table: 'rounds' },
    ],
    [qk.lobby(clubId)],
  )
  const games = lobby.data ? buildLobby(lobby.data.rows, lobby.data.totals, userId, t('guest')) : []
  return {
    games,
    toVerify: verify.data ?? [],
    isPending: lobby.isPending,
    isRefetching: lobby.isRefetching || verify.isRefetching,
    error: lobby.error,
    refetch: () => {
      void lobby.refetch()
      void verify.refetch()
    },
  }
}
