import * as Sentry from '@sentry/react-native'

/** Crash reporting on phones (Sentry). The web build uses monitoring.web.ts, which leaves it out. */
export function initMonitoring(dsn: string | undefined): void {
  if (dsn) Sentry.init({ dsn, tracesSampleRate: 0.1, sendDefaultPii: false })
}

export const wrapRoot: typeof Sentry.wrap = Sentry.wrap
