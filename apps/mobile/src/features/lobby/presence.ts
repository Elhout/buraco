import { useEffect } from 'react'
import { usePresence } from '@/lib/realtime'
import { onlineIds } from './model'
import { publishOnline, useSharedOnline } from './onlineStore'

/** Announces me on `club:<id>` (key = my user id) and shares who is online with other screens. */
export function useClubPresence(clubId: string, userId: string, name: string): ReadonlySet<string> {
  const entries = usePresence<{ name: string }>(`club:${clubId}`, userId, { name })
  const ids = onlineIds(entries)
  const signature = [...ids].sort().join(',')

  useEffect(() => {
    publishOnline(clubId, new Set(signature ? signature.split(',') : []))
  }, [clubId, signature])

  useEffect(() => () => publishOnline(clubId, null), [clubId])

  return ids
}

/**
 * Online members for screens opened over the lobby (New game). Uses the lobby's channel when it
 * is mounted; otherwise watches `club:<id>` itself without announcing.
 */
export function useOnlineMembers(clubId: string): ReadonlySet<string> {
  const shared = useSharedOnline(clubId)
  const own = usePresence<Record<string, never>>(`club:${clubId}`, null, null, shared === null)
  return shared ?? onlineIds(own)
}
