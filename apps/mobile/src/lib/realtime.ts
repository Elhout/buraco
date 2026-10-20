import type { RealtimeChannel } from '@supabase/supabase-js'
import { type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export interface TableSub {
  readonly table: string
  /** PostgREST-style filter, e.g. `game_id=eq.<uuid>` */
  readonly filter?: string
}

export interface RealtimeStatus {
  readonly connected: boolean
  /** When the subscription dropped; null while connected. */
  readonly downSince: number | null
  readonly lastEventAt: number | null
}

/** Spec: a red bar when the live subscription has been down for more than 10 seconds. */
export const DOWN_ALERT_MS = 10_000

let instanceCounter = 0

/**
 * The database is the single source of truth: any change to the watched rows invalidates the
 * given queries, and a reconnect refetches them (changes may have been missed while down).
 *
 * supabase.channel(topic) returns the existing channel for a topic, so each hook instance gets
 * its own topic; otherwise two screens watching the same game would share (and tear down) one.
 */
export function useRealtimeInvalidate(name: string, subs: readonly TableSub[], keys: readonly QueryKey[], enabled = true): RealtimeStatus {
  const client = useQueryClient()
  const [status, setStatus] = useState<RealtimeStatus>(() => ({ connected: false, downSince: Date.now(), lastEventAt: null }))
  const depKey = JSON.stringify([name, subs, keys, enabled])
  const keysRef = useRef(keys)
  useEffect(() => {
    keysRef.current = keys
  })

  useEffect(() => {
    if (!enabled) return
    const invalidate = (): void => {
      for (const key of keysRef.current) void client.invalidateQueries({ queryKey: key })
    }
    instanceCounter += 1
    let channel: RealtimeChannel = supabase.channel(`${name}#${instanceCounter}`)
    for (const sub of subs) {
      channel = channel.on(
        'postgres_changes',
        sub.filter
          ? { event: '*', schema: 'public', table: sub.table, filter: sub.filter }
          : { event: '*', schema: 'public', table: sub.table },
        () => {
          invalidate()
          setStatus((s) => ({ ...s, lastEventAt: Date.now() }))
        },
      )
    }
    let everConnected = false
    let disposed = false
    channel.subscribe((state) => {
      if (disposed) return // CLOSED from our own teardown must not flag the new channel as down
      if (state === 'SUBSCRIBED') {
        if (everConnected) invalidate()
        everConnected = true
        setStatus((s) => ({ ...s, connected: true, downSince: null }))
      } else {
        setStatus((s) => ({ ...s, connected: false, downSince: s.downSince ?? Date.now() }))
      }
    })
    return () => {
      disposed = true
      void supabase.removeChannel(channel)
    }
    // depKey captures every input; the arrays themselves are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, client])

  return status
}

/** True once the subscription has been down longer than DOWN_ALERT_MS. */
export function useConnectionAlert(status: RealtimeStatus): boolean {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (status.downSince === null) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [status.downSince])
  return status.downSince !== null && now - status.downSince > DOWN_ALERT_MS
}

export type PresenceMember<T> = T & { readonly key: string }
type Meta = Record<string, unknown>
type Members = readonly PresenceMember<Meta>[]

/**
 * Presence must share one topic per room (every phone joins `game:<id>`), so inside the app a
 * room's channel is shared and reference-counted: screens that overlap during navigation don't
 * tear each other's channel down. The channel's presence key is the tracker's user id; it is
 * re-created if someone starts tracking under a different key than a watcher created it with.
 */
interface Room {
  channel: RealtimeChannel
  key: string
  refs: number
  members: Members
  listeners: Set<(m: Members) => void>
  trackers: Map<number, Meta>
}

const rooms = new Map<string, Room>()
let subscriberCounter = 0

const snapshot = (channel: RealtimeChannel): Members =>
  Object.entries(channel.presenceState<Meta>()).flatMap(([k, metas]) => {
    const first = metas[0]
    return first ? [{ ...first, key: k }] : []
  })

const latestTracker = (room: Room): Meta | undefined => [...room.trackers.values()].at(-1)

function openChannel(name: string, room: Room): RealtimeChannel {
  const channel = supabase.channel(name, { config: { presence: { key: room.key } } })
  channel
    .on('presence', { event: 'sync' }, () => {
      room.members = snapshot(channel)
      room.listeners.forEach((l) => l(room.members))
    })
    .subscribe(async (state) => {
      const meta = latestTracker(room)
      if (state === 'SUBSCRIBED' && meta) await channel.track(meta)
    })
  return channel
}

function joinRoom(name: string, key: string | null): Room {
  const existing = rooms.get(name)
  if (existing) {
    existing.refs += 1
    if (key && existing.key !== key && existing.trackers.size === 0) {
      void supabase.removeChannel(existing.channel).then(() => {
        if (rooms.get(name) !== existing) return // everyone left meanwhile
        existing.key = key
        existing.channel = openChannel(name, existing)
      })
    }
    return existing
  }
  const room: Room = {
    channel: null as unknown as RealtimeChannel,
    key: key ?? `watcher-${Math.random().toString(36).slice(2)}`,
    refs: 1,
    members: [],
    listeners: new Set(),
    trackers: new Map(),
  }
  room.channel = openChannel(name, room)
  rooms.set(name, room)
  return room
}

function leaveRoom(name: string, room: Room): void {
  room.refs -= 1
  if (room.refs > 0) return
  rooms.delete(name)
  void supabase.removeChannel(room.channel)
}

/**
 * Realtime Presence: `game:<id>` (spectators) and `club:<id>` (online members).
 * Pass meta = null to watch without announcing yourself.
 */
export function usePresence<T extends Meta>(
  name: string,
  key: string | null,
  meta: T | null,
  enabled = true,
): readonly PresenceMember<T>[] {
  const [members, setMembers] = useState<Members>([])
  const metaKey = JSON.stringify(meta)

  useEffect(() => {
    if (!enabled) return
    const room = joinRoom(name, key)
    const id = ++subscriberCounter
    room.listeners.add(setMembers)
    // Deliver the room's current members asynchronously, like any later sync.
    queueMicrotask(() => {
      if (room.listeners.has(setMembers)) setMembers(room.members)
    })
    if (meta) {
      room.trackers.set(id, meta)
      void room.channel.track(meta).catch(() => undefined) // no-op until subscribed; sync re-tracks
    }
    return () => {
      room.listeners.delete(setMembers)
      if (room.trackers.delete(id)) {
        const next = latestTracker(room)
        void (next ? room.channel.track(next) : room.channel.untrack()).catch(() => undefined)
      }
      leaveRoom(name, room)
    }
    // metaKey stands in for meta's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key, metaKey, enabled])

  return members as readonly PresenceMember<T>[]
}
