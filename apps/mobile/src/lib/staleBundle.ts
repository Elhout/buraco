/**
 * Spotting a web build that is out of date: after a deploy, an open tab asks for script files that
 * no longer exist (the site answers with its HTML page instead). Pure; tested in staleBundle.test.ts.
 */
const STALE = [
  /loading chunk/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /unexpected token '?<'?/i,
  /requiring unknown module/i,
]

export const isStaleBundleError = (error: unknown): boolean => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '')
  return STALE.some((pattern) => pattern.test(message))
}

/** At most one automatic reload per window, so a real bug can never cause a reload loop. */
export const AUTO_RELOAD_WINDOW_MS = 60_000
export const mayAutoReload = (lastReloadAt: number | null, now: number): boolean =>
  lastReloadAt === null || now - lastReloadAt > AUTO_RELOAD_WINDOW_MS
