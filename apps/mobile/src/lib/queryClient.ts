import NetInfo from '@react-native-community/netinfo'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import { kv as Storage } from './kv'
import { AppState, Platform } from 'react-native'
import { toAppError } from './errors'

const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // kept long so the persisted cache (history) is available offline
      retry: (failureCount, error) => failureCount < 3 && toAppError(error).code === 'network',
    },
    mutations: { retry: false },
  },
})

/** Cache survives restarts in SQLite: history and stats open instantly, even with no signal. */
export const persister = createAsyncStoragePersister({ storage: Storage, key: 'buraco-query-cache', throttleTime: 2_000 })
export const PERSIST_MAX_AGE = 7 * DAY
/**
 * Bump to throw away every phone's saved cache once, e.g. after a query changed its data shape.
 * 2: club accounts were saved as a Map, which JSON turns into {} (crashed Club settings).
 */
export const PERSIST_BUSTER = '2'

let wired = false

export function wireQueryEnvironment(): void {
  if (wired) return
  wired = true
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected))))
  AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active')
  })
}
