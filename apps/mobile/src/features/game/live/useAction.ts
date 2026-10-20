import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { qk } from '@/lib/queryKeys'

export interface ActionRunner {
  readonly busy: boolean
  readonly error: unknown
  /** Runs one RPC; resolves true on success. Errors are kept for <ErrorText>. */
  readonly run: (task: () => Promise<unknown>) => Promise<boolean>
  readonly reset: () => void
}

/**
 * Busy + error state for a sheet button that calls one game action. On success the game is
 * refetched right away instead of waiting for the Realtime event.
 */
export function useAction(gameId: string): ActionRunner {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async (task: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await task()
      void client.invalidateQueries({ queryKey: qk.game(gameId) })
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, reset: () => setError(null) }
}

/** Refetch the game now (after a PIN-signed action whose RPC ran inside PinSheet). */
export function useRefreshGame(gameId: string): () => void {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: qk.game(gameId) })
}
