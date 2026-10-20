import { Redirect } from 'expo-router'
import { useSession } from '@/features/auth/SessionProvider'
import { useClubs } from '@/features/clubs/ClubProvider'

/** Entry point: sends each stage of the flow to its first screen. */
export default function Index() {
  const { stage } = useSession()
  const { clubs } = useClubs()
  if (stage === 'signedOut') return <Redirect href="/sign-in" />
  if (stage === 'needsProfile') return <Redirect href="/profile-setup" />
  if (stage === 'needsPin') return <Redirect href="/pin" />
  if (stage === 'ready' && clubs.length === 0) return <Redirect href="/club-setup" />
  return <Redirect href="/club" />
}
