import * as Haptics from 'expo-haptics'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/features/auth/SessionProvider'
import type { ErrorCode } from '@/lib/errors'
import { onOutboxDrop } from '@/lib/outbox'
import { setActiveGame } from '@/lib/push'
import { type PresenceMember, usePresence } from '@/lib/realtime'
import type { GameView } from '../model'

/**
 * While the live screen is focused, pushes about this game are suppressed (the in-app sheets are
 * enough). The screen is allowed to sleep as usual; the lock screen shows the live score push.
 */
export function useLiveFocus(gameId: string): void {
  useFocusEffect(
    useCallback(() => {
      setActiveGame(gameId)
      return () => setActiveGame(null)
    }, [gameId]),
  )
}

export interface Watcher {
  readonly key: string
  readonly name: string
  readonly isMe: boolean
}

type PresenceMeta = { name: string }

/** Everyone with this game open (Presence channel game:<id>), minus the four players. */
export function useWatchers(gameId: string, view: GameView | null): readonly Watcher[] {
  const { userId, profile } = useSession()
  const members: readonly PresenceMember<PresenceMeta>[] = usePresence<PresenceMeta>(
    `game:${gameId}`,
    userId,
    { name: profile?.display_name ?? '' },
    view !== null,
  )
  const seated = new Set((view?.seats ?? []).flatMap((s) => (s.userId ? [s.userId] : [])))
  return members
    .filter((m) => !seated.has(m.key))
    .map((m) => ({ key: m.key, name: typeof m.name === 'string' ? m.name : '', isMe: m.key === userId }))
}

/** Success haptic on every phone when a round posts (the confirmed count goes up). */
export function usePostedRoundHaptics(confirmedCount: number | null): void {
  const previous = useRef<number | null>(null)
  useEffect(() => {
    if (confirmedCount === null) return
    if (previous.current !== null && confirmedCount > previous.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    previous.current = confirmedCount
  }, [confirmedCount])
}

/** A queued round of this game the server refused (e.g. the other team's entry got there first). */
export function useOutboxRefusal(gameId: string): { code: ErrorCode | null; clear: () => void } {
  const [code, setCode] = useState<ErrorCode | null>(null)
  useEffect(
    () =>
      onOutboxDrop((item, errorCode) => {
        if (item.payload.gameId !== gameId) return
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        // The outbox reports codes produced by toAppError, so this is always an ErrorCode.
        setCode(errorCode as ErrorCode)
      }),
    [gameId],
  )
  return { code, clear: () => setCode(null) }
}
