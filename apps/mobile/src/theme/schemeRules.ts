/** Pure light/dark rules (tested in schemeRules.test.ts). */
export type ThemePreference = 'system' | 'light' | 'dark'
export type Scheme = 'light' | 'dark'

export const parsePreference = (value: string | null | undefined): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system'

/** "system" follows the phone; an unknown system setting falls back to light. */
export const resolveScheme = (pref: ThemePreference, system: string | null | undefined): Scheme =>
  pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref
