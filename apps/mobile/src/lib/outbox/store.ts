import * as SQLite from 'expo-sqlite'
import type { OutboxItem, OutboxStore } from './core'

interface Row {
  id: string
  kind: string
  payload: string
  created_at: number
  attempts: number
  last_error: string | null
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

const db = (): Promise<SQLite.SQLiteDatabase> => {
  dbPromise ??= SQLite.openDatabaseAsync('buraco.db').then(async (conn) => {
    await conn.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `)
    return conn
  })
  return dbPromise
}

const fromRow = (r: Row): OutboxItem => ({
  id: r.id,
  kind: 'submit_round',
  payload: JSON.parse(r.payload) as OutboxItem['payload'],
  createdAt: r.created_at,
  attempts: r.attempts,
  lastError: r.last_error,
})

/** Durable outbox in SQLite: survives the app being killed at the table. */
export const sqliteStore: OutboxStore = {
  all: async () => (await (await db()).getAllAsync<Row>('SELECT * FROM outbox ORDER BY created_at')).map(fromRow),
  put: async (item) => {
    await (
      await db()
    ).runAsync(
      'INSERT OR REPLACE INTO outbox (id, kind, payload, created_at, attempts, last_error) VALUES (?, ?, ?, ?, ?, ?)',
      item.id,
      item.kind,
      JSON.stringify(item.payload),
      item.createdAt,
      item.attempts,
      item.lastError,
    )
  },
  remove: async (id) => {
    await (await db()).runAsync('DELETE FROM outbox WHERE id = ?', id)
  },
}
