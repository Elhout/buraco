import 'expo-sqlite/localStorage/install'

/** Where Supabase keeps the session: SQLite-backed localStorage on phones, the browser's on the web. */
export const authStorage = localStorage
