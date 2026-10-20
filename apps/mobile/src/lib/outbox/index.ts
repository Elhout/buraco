import NetInfo from '@react-native-community/netinfo'
import type { QueryClient } from '@tanstack/react-query'
import { randomUUID } from 'expo-crypto'
import { AppState } from 'react-native'
import { useSyncExternalStore } from 'react'
import { type ErrorCode, toAppError } from '../errors'
import { qk } from '../queryKeys'
import { rpc } from '../rpc'
import { type OutboxItem, type SendOutcome, type SubmitRoundPayload, flush, newSubmitRound, pendingForGame } from './core'
import { sqliteStore } from './store'

export type { OutboxItem } from './core'

type DropListener = (item: OutboxItem, errorCode: ErrorCode) => void

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(['network', 'notAuthenticated', 'unknown'])

let snapshot: readonly OutboxItem[] = []
const listeners = new Set<() => void>()
const dropListeners = new Set<DropListener>()
let flushing: Promise<void> | null = null
let queryClient: QueryClient | null = null

const emit = (): void => listeners.forEach((l) => l())

async function refresh(): Promise<void> {
  snapshot = await sqliteStore.all()
  emit()
}

async function send(item: OutboxItem): Promise<SendOutcome> {
  const p = item.payload
  try {
    await rpc('submit_round', {
      p_game_id: p.gameId,
      p_team_a: p.teamA,
      p_team_b: p.teamB,
      p_cut_seats: [...p.cutSeats],
      p_client_id: p.clientId,
    })
    return { kind: 'done' }
  } catch (error) {
    const e = toAppError(error)
    // Network blips, an expired session or a 5xx are transient; only a business-rule refusal
    // (e.g. the other team's entry got there first) drops the round.
    return RETRYABLE.has(e.code) ? { kind: 'retry', error: e.code } : { kind: 'drop', error: e.code }
  }
}

/** Posts everything waiting; safe to call any time (concurrent calls share one run). */
export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    try {
      const report = await flush(sqliteStore, send)
      for (const item of [...report.sent, ...report.dropped.map((d) => d.item)]) {
        void queryClient?.invalidateQueries({ queryKey: qk.game(item.payload.gameId) })
      }
      for (const { item, error } of report.dropped) dropListeners.forEach((l) => l(item, error as ErrorCode))
    } finally {
      flushing = null
      await refresh()
    }
  })()
  return flushing
}

/** Saves a round locally first, then tries to post it. Returns the idempotency key. */
export async function enqueueRound(payload: Omit<SubmitRoundPayload, 'clientId'>): Promise<string> {
  const clientId = randomUUID()
  await sqliteStore.put(newSubmitRound({ ...payload, clientId }, Date.now()))
  await refresh()
  void flushOutbox()
  return clientId
}

/** Wire once at startup: flush on reconnect and when the app comes back to the foreground. */
export function startOutbox(client: QueryClient): () => void {
  queryClient = client
  void refresh().then(flushOutbox)
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) void flushOutbox()
  })
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') void flushOutbox()
  })
  return () => {
    unsubscribeNet()
    appState.remove()
  }
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Rounds of this game still waiting to be sent ("Sending…" rows on the live screen). */
export function usePendingRounds(gameId: string): readonly OutboxItem[] {
  const all = useSyncExternalStore(subscribe, () => snapshot)
  return pendingForGame(all, gameId)
}

/** Called when the server refused a queued round, e.g. the other team's entry got there first. */
export function onOutboxDrop(listener: DropListener): () => void {
  dropListeners.add(listener)
  return () => dropListeners.delete(listener)
}
