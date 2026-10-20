import { Redirect } from 'expo-router'
import { useSession } from '@/features/auth/SessionProvider'
import { ProfileSetupScreen } from '@/features/auth/screens/ProfileSetupScreen'

export default function Route() {
  const { stage } = useSession()
  // Saving the profile moves the stage on; the PIN step is next.
  if (stage === 'needsPin') return <Redirect href="/pin" />
  return <ProfileSetupScreen />
}
