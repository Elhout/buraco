import type { Tables } from '@buraco/shared'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import i18n, { type Lang, setLanguage } from '@/i18n'
import { registerForPush, unregisterPush } from '@/lib/push'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>

/**
 * Where the user is in the flow; the root layout guards routes on this. Accounts are created by a
 * club admin with a name already, so signing in goes straight into the app (no PIN, no setup).
 */
export type Stage = 'loading' | 'error' | 'signedOut' | 'ready'

interface SessionValue {
  stage: Stage
  session: Session | null
  userId: string | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [restored, setRestored] = useState(false)
  const userId = session?.user.id ?? null

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setRestored(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const profile = useQuery({
    queryKey: qk.me(userId ?? 'none'),
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data
    },
  })

  // A language chosen in Settings (which stamps onboarded_at) follows the player across phones.
  const profileLang = profile.data?.onboarded_at ? (profile.data.lang as Lang) : null
  useEffect(() => {
    if (profileLang && profileLang !== i18n.language) void setLanguage(profileLang)
  }, [profileLang])

  useEffect(() => {
    if (userId) void registerForPush().catch(() => undefined)
  }, [userId])

  const stage: Stage = useMemo(() => {
    if (!restored) return 'loading'
    if (!session) return 'signedOut'
    if (profile.isPending) return 'loading'
    if (profile.isError && !profile.data) return 'error'
    return 'ready'
  }, [restored, session, profile.isPending, profile.isError, profile.data])

  const value: SessionValue = {
    stage,
    session,
    userId,
    profile: profile.data ?? null,
    refreshProfile: async () => {
      if (!userId) return
      await client.invalidateQueries({ queryKey: qk.me(userId) })
    },
    signOut: async () => {
      await unregisterPush()
      await supabase.auth.signOut()
      client.clear()
    },
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** For screens behind the "ready" guard, where a user id always exists. */
export function useUserId(): string {
  const { userId } = useSession()
  if (!userId) throw new Error('No signed-in user')
  return userId
}
