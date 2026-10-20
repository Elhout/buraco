import { getLocales } from 'expo-localization'
import { kv as Storage } from '../lib/kv'
import * as Updates from 'expo-updates'
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DevSettings, I18nManager, Platform } from 'react-native'
import { type Lang, NAMESPACES, resources } from './resources'

export type { Lang } from './resources'

const LANG_KEY = 'app-language'

export const deviceLanguage = (): Lang => (getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en')

const storedLanguage = (): Lang | null => {
  try {
    const v = Storage.getItemSync(LANG_KEY)
    return v === 'ar' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export const initialLanguage = (): Lang => storedLanguage() ?? deviceLanguage()

/** The app's own i18next instance; initReactI18next makes it the one useTranslation reads. */
const i18n = createInstance()

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React escapes
  returnNull: false,
})

export const isRTL = (lang: Lang): boolean => lang === 'ar'

/**
 * Web build: the page direction comes from <html dir>, which react-native-web's flex layout and
 * logical (start/end) styles follow. Its I18nManager has no isRTL, so set it for the code that
 * mirrors icons.
 */
function applyWebDirection(lang: Lang): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr'
  ;(I18nManager as { isRTL?: boolean }).isRTL = isRTL(lang)
}

/**
 * Switches language. Arabic mirrors the layout, which React Native only applies after a reload,
 * so a direction change reloads the app (the page, on the web build).
 */
export async function setLanguage(lang: Lang): Promise<void> {
  await i18n.changeLanguage(lang)
  try {
    Storage.setItemSync(LANG_KEY, lang)
  } catch {
    // Non-fatal: the profile language still applies on next sign-in.
  }
  const rtl = isRTL(lang)
  if (Platform.OS === 'web') {
    // A full reload re-renders every screen in the new direction, as on phones.
    if (I18nManager.isRTL !== rtl) globalThis.location?.reload()
    return
  }
  if (I18nManager.isRTL === rtl) return
  I18nManager.allowRTL(rtl)
  I18nManager.forceRTL(rtl)
  try {
    await Updates.reloadAsync()
  } catch {
    if (__DEV__) DevSettings.reload()
  }
}

/** Keep native direction aligned with the stored language at startup. */
export function syncDirectionOnLaunch(): void {
  if (Platform.OS === 'web') {
    applyWebDirection(initialLanguage())
    return
  }
  const rtl = isRTL(initialLanguage())
  I18nManager.allowRTL(rtl)
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl)
}

export default i18n
