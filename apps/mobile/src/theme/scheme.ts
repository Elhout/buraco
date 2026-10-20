import { Appearance } from 'react-native'
import { kv } from '../lib/kv'
import { reloadApp } from '../lib/reload'
import { type Scheme, type ThemePreference, parsePreference, resolveScheme } from './schemeRules'

export type { Scheme, ThemePreference } from './schemeRules'

/** Same key the web index.html reads to paint the right background before the app loads. */
const KEY = 'theme'

export function themePreference(): ThemePreference {
  try {
    return parsePreference(kv.getItemSync(KEY))
  } catch {
    return 'system'
  }
}

/** The scheme for this run of the app; tokens.ts builds the palette from it at startup. */
export const scheme: Scheme = resolveScheme(themePreference(), Appearance.getColorScheme())

/** Saves the choice and restarts when the colours actually change. */
export async function setThemePreference(pref: ThemePreference): Promise<void> {
  try {
    kv.setItemSync(KEY, pref)
  } catch {
    // Non-fatal: the choice just won't survive a restart.
  }
  if (resolveScheme(pref, Appearance.getColorScheme()) !== scheme) await reloadApp()
}

/** In "system" mode, follow the phone switching between light and dark. */
export function watchSystemScheme(): () => void {
  const sub = Appearance.addChangeListener(({ colorScheme }) => {
    if (resolveScheme(themePreference(), colorScheme) !== scheme) void reloadApp()
  })
  return () => sub.remove()
}
