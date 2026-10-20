import { useLocalSearchParams } from 'expo-router'
import { LiveGameScreen } from '@/features/game/live/LiveGameScreen'

export default function LiveGameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <LiveGameScreen key={id} gameId={id} />
}
