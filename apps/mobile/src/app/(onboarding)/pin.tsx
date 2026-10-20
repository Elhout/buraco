import { Redirect } from 'expo-router'
import { useSession } from '@/features/auth/SessionProvider'
import { PinSetupScreen } from '@/features/auth/screens/PinSetupScreen'

export default function Route() {
  const { stage } = useSession()
  if (stage === 'needsProfile') return <Redirect href="/profile-setup" />
  return <PinSetupScreen />
}
