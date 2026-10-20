import * as Updates from 'expo-updates'
import { DevSettings, Platform } from 'react-native'

/**
 * Restarts the JS app. Language direction and the colour theme are read once at startup (styles
 * are created when modules load), so changing either one reloads, like a fresh launch.
 */
export async function reloadApp(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.location?.reload()
    return
  }
  try {
    await Updates.reloadAsync()
  } catch {
    if (__DEV__) DevSettings.reload()
  }
}
