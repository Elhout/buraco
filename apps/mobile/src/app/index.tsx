import { Redirect } from 'expo-router'
import { useSession } from '@/features/auth/SessionProvider'

/** Entry point: sign in, or straight to Play. */
export default function Index() {
  const { stage } = useSession()
  if (stage === 'signedOut') return <Redirect href="/sign-in" />
  return <Redirect href="/club" />
}
