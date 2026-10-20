import { type QueryClient, useQuery } from '@tanstack/react-query'
import { biometricsAvailable, disableBiometricPin, hasBiometricPin } from '@/lib/biometricPin'

/** Local query keys for this feature, same ['entity', id, 'facet'] convention as lib/queryKeys. */
export const profileKeys = {
  biometric: (userId: string) => ['profile', userId, 'biometric'] as const,
  biometricHardware: ['device', 'biometrics'] as const,
}

export function useBiometricState(userId: string) {
  const hardware = useQuery({ queryKey: profileKeys.biometricHardware, queryFn: biometricsAvailable, staleTime: Infinity })
  const enabled = useQuery({ queryKey: profileKeys.biometric(userId), queryFn: () => hasBiometricPin(userId) })
  return { available: hardware.data === true, enabled: enabled.data === true, loading: hardware.isPending || enabled.isPending }
}

/** The keychain still holds the old PIN after a change or reset; drop it so it can't sign anything. */
export async function forgetStoredPin(userId: string, client: QueryClient): Promise<void> {
  await disableBiometricPin(userId).catch(() => undefined)
  await client.invalidateQueries({ queryKey: profileKeys.biometric(userId) })
}
