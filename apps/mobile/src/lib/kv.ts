import Storage from 'expo-sqlite/kv-store'

/** Small key-value store: SQLite on phones, localStorage on the web build (see kv.web.ts). */
export const kv = Storage
