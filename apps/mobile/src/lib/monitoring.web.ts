/**
 * Web build: no crash reporting. Sentry is most of the startup download, which made iPhone Safari
 * show a black page for seconds; it is only bundled on phones (monitoring.ts).
 */
export function initMonitoring(_dsn: string | undefined): void {}

export const wrapRoot = <T>(component: T): T => component
