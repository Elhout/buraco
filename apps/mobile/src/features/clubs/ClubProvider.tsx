import type { Enums, Tables } from '@buraco/shared'
import { useQuery } from '@tanstack/react-query'
import { kv as Storage } from '../../lib/kv'
import { type ReactNode, createContext, useContext, useState } from 'react'
import { useSession } from '@/features/auth/SessionProvider'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export type Club = Tables<'clubs'>
export interface MyClub {
  club: Club
  role: Enums<'club_role'>
}

interface ClubValue {
  clubs: readonly MyClub[]
  loading: boolean
  /** The list failed to load and there is nothing cached: don't treat it as "no clubs". */
  failed: boolean
  current: MyClub | null
  select: (clubId: string) => void
  refresh: () => Promise<unknown>
}

const ClubContext = createContext<ClubValue | null>(null)
const CURRENT_KEY = 'current-club'

const remembered = (): string | null => {
  try {
    return Storage.getItemSync(CURRENT_KEY)
  } catch {
    return null
  }
}

/** The clubs I belong to, and which one the tabs are showing. Everything is scoped to it. */
export function ClubProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession()
  const [selected, setSelected] = useState<string | null>(remembered)

  const query = useQuery({
    queryKey: qk.myClubs(userId ?? 'none'),
    enabled: userId !== null,
    queryFn: async (): Promise<MyClub[]> => {
      const { data, error } = await supabase.from('club_members').select('role, clubs(*)').eq('user_id', userId!).order('joined_at')
      if (error) throw error
      return data.flatMap((row) => (row.clubs ? [{ club: row.clubs, role: row.role }] : []))
    },
  })

  // No visible clubs: someone who isn't in the group yet is put in it (the very first account
  // creates it). The server does the work; this just asks once and reloads the list.
  const needsGroup = userId !== null && query.isSuccess && query.data.length === 0
  const ensure = useQuery({
    queryKey: ['membership', userId],
    enabled: needsGroup,
    queryFn: async () => {
      await rpc('ensure_membership', {})
      await query.refetch()
      return true
    },
  })

  const clubs = query.data ?? []
  const current = clubs.find((c) => c.club.id === selected) ?? clubs[0] ?? null

  const value: ClubValue = {
    clubs,
    loading: query.isPending || (needsGroup && !ensure.isError),
    failed: (query.isError && query.data === undefined) || (needsGroup && ensure.isError),
    current,
    select: (clubId) => {
      setSelected(clubId)
      try {
        Storage.setItemSync(CURRENT_KEY, clubId)
      } catch {
        // Selection still applies for this session.
      }
    },
    refresh: async () => {
      const result = await query.refetch()
      if (result.error) throw result.error
      return result.data
    },
  }
  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>
}

export function useClubs(): ClubValue {
  const ctx = useContext(ClubContext)
  if (!ctx) throw new Error('useClubs must be used inside ClubProvider')
  return ctx
}

/** For screens that only render once a club exists (behind the root guard). */
export function useCurrentClub(): MyClub {
  const { current } = useClubs()
  if (!current) throw new Error('No club selected')
  return current
}
