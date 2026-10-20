/**
 * Write outbox (docs/SPEC.md "Offline and conflicts"): a round entered with no signal is saved
 * locally, shown as Sending, and posted when the connection returns. Pure logic; storage and
 * the network call are injected so this is unit-testable and platform-free.
 */

export interface SubmitRoundPayload {
  readonly gameId: string
  readonly teamA: number
  readonly teamB: number
  readonly cutSeats: readonly number[]
  /** Idempotency key: the server returns the same round for a replay (rounds.client_id). */
  readonly clientId: string
}

export interface OutboxItem {
  readonly id: string
  readonly kind: 'submit_round'
  readonly payload: SubmitRoundPayload
  readonly createdAt: number
  readonly attempts: number
  readonly lastError: string | null
}

export interface OutboxStore {
  all(): Promise<readonly OutboxItem[]>
  put(item: OutboxItem): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * done: posted (or already posted). retry: transient, keep for later.
 * drop: the server refused it for good (e.g. the other team's entry won the race).
 */
export type SendOutcome =
  { readonly kind: 'done' } | { readonly kind: 'retry'; readonly error: string } | { readonly kind: 'drop'; readonly error: string }

export type Sender = (item: OutboxItem) => Promise<SendOutcome>

export interface FlushReport {
  readonly sent: readonly OutboxItem[]
  readonly dropped: readonly { readonly item: OutboxItem; readonly error: string }[]
  readonly pending: number
}

export const MAX_ATTEMPTS = 20

export function newSubmitRound(payload: SubmitRoundPayload, now: number): OutboxItem {
  return { id: payload.clientId, kind: 'submit_round', payload, createdAt: now, attempts: 0, lastError: null }
}

/** Sends items oldest first; stops at the first transient failure so order is preserved. */
export async function flush(store: OutboxStore, send: Sender): Promise<FlushReport> {
  const items = [...(await store.all())].sort((a, b) => a.createdAt - b.createdAt)
  const sent: OutboxItem[] = []
  const dropped: { item: OutboxItem; error: string }[] = []
  let pending = 0

  for (const [index, item] of items.entries()) {
    const outcome = await send(item)
    if (outcome.kind === 'done') {
      await store.remove(item.id)
      sent.push(item)
      continue
    }
    if (outcome.kind === 'drop' || item.attempts + 1 >= MAX_ATTEMPTS) {
      await store.remove(item.id)
      dropped.push({ item, error: outcome.error })
      continue
    }
    await store.put({ ...item, attempts: item.attempts + 1, lastError: outcome.error })
    pending = items.length - index
    break
  }
  return { sent, dropped, pending }
}

export const pendingForGame = (items: readonly OutboxItem[], gameId: string): readonly OutboxItem[] =>
  items.filter((i) => i.payload.gameId === gameId)

/** In-memory store, used in tests and as a fallback where SQLite is unavailable. */
export function memoryStore(initial: readonly OutboxItem[] = []): OutboxStore {
  let items = [...initial]
  return {
    all: async () => items,
    put: async (item) => {
      items = [...items.filter((i) => i.id !== item.id), item]
    },
    remove: async (id) => {
      items = items.filter((i) => i.id !== id)
    },
  }
}
