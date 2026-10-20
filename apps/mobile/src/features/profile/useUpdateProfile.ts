import type { Database } from '@buraco/shared'
import { useMutation } from '@tanstack/react-query'
import { useSession } from '@/features/auth/SessionProvider'
import { supabase } from '@/lib/supabase'

/** Columns the client may update (see the column grants on public.profiles). */
export type ProfilePatch = Pick<
  Database['public']['Tables']['profiles']['Update'],
  'display_name' | 'lang' | 'onboarded_at' | 'notify_game_started' | 'notify_tournament'
>

export function useUpdateProfile() {
  const { userId, refreshProfile } = useSession()
  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<void> => {
      if (!userId) throw new Error('not authenticated')
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
      await refreshProfile()
    },
  })
}
