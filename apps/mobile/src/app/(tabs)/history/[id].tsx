import { useLocalSearchParams } from 'expo-router'
import { GameDetailScreen } from '@/features/history/detail/GameDetailScreen'

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <GameDetailScreen key={id} gameId={id} />
}
