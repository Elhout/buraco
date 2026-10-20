import type { Tables } from '@buraco/shared'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import i18n, { type Lang, setLanguage } from '@/i18n'
import { registerForPush, unregisterPush } from '@/lib/push'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>

/** Where the user is in the flow; the root layout guards routes on this. */
export type Stage = 'loading' | 'error' | 'signedOut' | 'needsProfile' | 'needsPin' | 'ready'

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

  const hasPin = useQuery({
    queryKey: qk.hasPin(userId ?? 'none'),
    enabled: userId !== null,
    queryFn: () => rpc('has_pin', {}),
  })

  // The profile language wins once onboarding is done, so it follows the user across phones.
  const profileLang = profile.data?.onboarded_at ? (profile.data.lang as Lang) : null
  useEffect(() => {
    if (profileLang && profileLang !== i18n.language) void setLanguage(profileLang)
  }, [profileLang])

  useEffect(() => {
    if (userId && hasPin.data) void registerForPush().catch(() => undefined)
  }, [userId, hasPin.data])

  const stage: Stage = useMemo(() => {
    if (!restored) return 'loading'
    if (!session) return 'signedOut'
    if (profile.isPending || hasPin.isPending) return 'loading'
    // A failed load must not look like "not onboarded yet" (that would re-run setup).
    if ((profile.isError && !profile.data) || (hasPin.isError && hasPin.data === undefined)) return 'error'
    if (!profile.data?.onboarded_at) return 'needsProfile'
    if (!hasPin.data) return 'needsPin'
    return 'ready'
  }, [restored, session, profile.isPending, profile.isError, profile.data, hasPin.isPending, hasPin.isError, hasPin.data])

  const value: SessionValue = {
    stage,
    session,
    userId,
    profile: profile.data ?? null,
    refreshProfile: async () => {
      if (!userId) return
      await Promise.all([client.invalidateQueries({ queryKey: qk.me(userId) }), client.invalidateQueries({ queryKey: qk.hasPin(userId) })])
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
