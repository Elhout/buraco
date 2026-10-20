import { useMutation } from '@tanstack/react-query'
import { useClubs } from '@/features/clubs/ClubProvider'
import { AppError } from '@/lib/errors'
import { rpc } from '@/lib/rpc'

/**
 * Join by code / create a club, then make it the current club. join_club returns null for an
 * unknown code (so the server can count failed attempts) and raises after too many of them.
 */
export function useJoinClub(onJoined?: (clubId: string) => void) {
  const { refresh, select } = useClubs()
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const clubId: string | null = await rpc('join_club', { p_code: code })
      if (!clubId) throw new AppError('invalidCode', 'invalid invite code')
      await refresh()
      select(clubId)
      return clubId
    },
    onSuccess: (clubId) => onJoined?.(clubId),
  })
}

export function useCreateClub(onCreated?: (clubId: string) => void) {
  const { refresh, select } = useClubs()
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const clubId = await rpc('create_club', { p_name: name })
      await refresh()
      select(clubId)
      return clubId
    },
    onSuccess: (clubId) => onCreated?.(clubId),
  })
}
