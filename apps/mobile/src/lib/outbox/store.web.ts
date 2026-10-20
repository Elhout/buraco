import type { OutboxItem, OutboxStore } from './core'

const KEY = 'buraco-outbox'

const read = (): OutboxItem[] => {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    return raw ? (JSON.parse(raw) as OutboxItem[]) : []
  } catch {
    return []
  }
}

const write = (items: readonly OutboxItem[]): void => {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(items))
}

/** Web build: the outbox in localStorage (same contract as the SQLite store on phones). */
export const sqliteStore: OutboxStore = {
  all: async () => [...read()].sort((a, b) => a.createdAt - b.createdAt),
  put: async (item) => write([...read().filter((i) => i.id !== item.id), item]),
  remove: async (id) => write(read().filter((i) => i.id !== id)),
}
