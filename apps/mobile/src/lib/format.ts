import { getLocales } from 'expo-localization'

/**
 * Spec: numerals follow the device locale (an Arabic-locale phone shows ٢٠٠٠), while UI text
 * follows the chosen app language. Team labels A/B always stay Latin.
 */
const deviceTag = (): string => getLocales()[0]?.languageTag ?? 'en'

let numberFormat: Intl.NumberFormat | null = null
const nf = (): Intl.NumberFormat => (numberFormat ??= new Intl.NumberFormat(deviceTag(), { maximumFractionDigits: 1 }))

export const formatNumber = (n: number): string => nf().format(n)

/** "+100", "−50" with a true minus sign; zero unsigned. */
export const formatSigned = (n: number): string =>
  n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(Math.abs(n))}` : formatNumber(0)

export const formatPercent = (ratio: number): string =>
  new Intl.NumberFormat(deviceTag(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio)

/** True when the device renders digits in a non-Latin script (the score font only has Latin digits). */
export const usesNativeDigits = (): boolean => !/^[0-9]$/.test(formatNumber(1))

export const formatDate = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const formatDateTime = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const formatTime = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/** mm:ss countdown, never negative. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${formatNumber(m)}:${s < 10 ? formatNumber(0) : ''}${formatNumber(s)}`
}
