import type { Enums } from '@buraco/shared'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'

export interface Member {
  readonly userId: string
  readonly name: string
  readonly avatarUrl: string | null
  readonly role: Enums<'club_role'>
  readonly joinedAt: string
}

export async function fetchMembers(clubId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, joined_at, profiles(display_name, avatar_url)')
    .eq('club_id', clubId)
    .order('joined_at')
  if (error) throw error
  return data.map((m) => ({
    userId: m.user_id,
    name: m.profiles?.display_name ?? '',
    avatarUrl: m.profiles?.avatar_url ?? null,
    role: m.role,
    joinedAt: m.joined_at,
  }))
}

/** Club members with names, shared by the player pickers, stats and tournaments. Live. */
export function useClubMembers(clubId: string) {
  const query = useQuery({ queryKey: qk.members(clubId), queryFn: () => fetchMembers(clubId), staleTime: 5 * 60_000 })
  useRealtimeInvalidate(`members:${clubId}`, [{ table: 'club_members', filter: `club_id=eq.${clubId}` }], [qk.members(clubId)])
  const byId = new Map((query.data ?? []).map((m) => [m.userId, m]))
  return { ...query, members: query.data ?? [], nameOf: (userId: string | null): string => (userId ? (byId.get(userId)?.name ?? '') : '') }
}
