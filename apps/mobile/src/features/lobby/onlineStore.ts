import { useSyncExternalStore } from 'react'

/**
 * Who is online in each club, published by the lobby's `club:<id>` Presence channel.
 *
 * supabase-js returns the same channel object for the same topic, so a second subscriber to
 * `club:<id>` (e.g. the New game picker, opened over the lobby) would collide with the lobby's.
 * The lobby owns the channel and shares the result here instead.
 */

type Listener = () => void
const listeners = new Set<Listener>()
let snapshot: ReadonlyMap<string, ReadonlySet<string>> = new Map()

export function publishOnline(clubId: string, ids: ReadonlySet<string> | null): void {
  const next = new Map(snapshot)
  if (ids) next.set(clubId, ids)
  else next.delete(clubId)
  snapshot = next
  for (const l of listeners) l()
}

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Online user ids for the club, or null when no lobby is publishing it. */
export function useSharedOnline(clubId: string): ReadonlySet<string> | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(clubId) ?? null,
    () => null,
  )
}
