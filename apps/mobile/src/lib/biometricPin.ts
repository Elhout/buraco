import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

/**
 * Optional biometric shortcut for the PIN sheet. The PIN is kept in the device keychain /
 * keystore and only released after Face ID / fingerprint (requireAuthentication), so the PIN
 * stays a signature typed or unlocked on the player's own phone.
 */
const keyFor = (userId: string): string => `pin.${userId.replace(/[^a-zA-Z0-9]/g, '')}`

export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
}

export async function hasBiometricPin(userId: string): Promise<boolean> {
  if (Platform.OS === 'web') return false
  try {
    return Boolean(await SecureStore.getItemAsync(`${keyFor(userId)}.enabled`))
  } catch {
    return false
  }
}

export async function enableBiometricPin(userId: string, pin: string, prompt: string): Promise<boolean> {
  const auth = await LocalAuthentication.authenticateAsync({ promptMessage: prompt })
  if (!auth.success) return false
  await SecureStore.setItemAsync(keyFor(userId), pin, { requireAuthentication: true, authenticationPrompt: prompt })
  await SecureStore.setItemAsync(`${keyFor(userId)}.enabled`, '1')
  return true
}

export async function disableBiometricPin(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(userId))
  await SecureStore.deleteItemAsync(`${keyFor(userId)}.enabled`)
}

/** Prompts for biometrics and returns the stored PIN, or null if cancelled/unavailable. */
export async function unlockBiometricPin(userId: string, prompt: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyFor(userId), { requireAuthentication: true, authenticationPrompt: prompt })
  } catch {
    return null
  }
}
