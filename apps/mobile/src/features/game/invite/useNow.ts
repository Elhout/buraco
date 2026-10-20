import { useEffect, useState } from 'react'

/** Current time, ticking every `intervalMs` while `active` (drives the invite countdown). */
export function useNow(active: boolean, intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])
  return now
}
