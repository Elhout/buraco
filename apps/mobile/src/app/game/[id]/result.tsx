import { useLocalSearchParams } from 'expo-router'
import { ResultScreen } from '@/features/game/result/ResultScreen'

export default function GameResultRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ResultScreen gameId={id} />
}
