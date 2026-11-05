/**
 * When a game was played, for the history: the day with its weekday, and the time. Pure (no
 * phone APIs) so it is unit-tested; `lang` is the app language, `timeZone` only for tests.
 */

const day = (iso: string, lang: string, timeZone?: string): string =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso))

const clock = (iso: string, lang: string, timeZone?: string): string =>
  new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))

/** History card: "Wed, 5 Nov 2026 · 11:18 PM" (when the game ended). */
export const gameDateTime = (iso: string, lang: string, timeZone?: string): string =>
  `${day(iso, lang, timeZone)} · ${clock(iso, lang, timeZone)}`

/** Game page: "Wed, 5 Nov 2026 · 10:35 PM – 11:18 PM"; just the start while it is still going. */
export function gameSpan(startIso: string | null, endIso: string | null, lang: string, timeZone?: string): string {
  const from = startIso ?? endIso
  if (!from) return ''
  const start = `${day(from, lang, timeZone)} · ${clock(from, lang, timeZone)}`
  if (!startIso || !endIso) return start
  const sameDay = day(startIso, lang, timeZone) === day(endIso, lang, timeZone)
  return sameDay ? `${start} – ${clock(endIso, lang, timeZone)}` : `${start} – ${gameDateTime(endIso, lang, timeZone)}`
}

/** A YYYY-MM-DD day as "Thursday, 5 November 2026" (noon, so no time zone can move it). */
export const dayLabel = (day: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00`))
