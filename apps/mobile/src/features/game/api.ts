import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/SessionProvider'
import { qk } from '@/lib/queryKeys'
import { type RealtimeStatus, useRealtimeInvalidate } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { type GameView, type RoundRow, type SeatRow, buildGameView } from './model'

export interface GameRows {
  game: GameView['game']
  seats: SeatRow[]
  rounds: RoundRow[]
}

export async function fetchGameRows(gameId: string): Promise<GameRows> {
  const [game, seats, rounds] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single(),
    supabase.from('game_seats').select('*, profiles(display_name, avatar_url)').eq('game_id', gameId),
    supabase.from('rounds').select('*, round_lines(*)').eq('game_id', gameId).order('round_no'),
  ])
  if (game.error) throw game.error
  if (seats.error) throw seats.error
  if (rounds.error) throw rounds.error
  return { game: game.data, seats: seats.data as SeatRow[], rounds: rounds.data }
}

export interface UseGameResult {
  view: GameView | null
  isPending: boolean
  error: unknown
  realtime: RealtimeStatus
  dataUpdatedAt: number
  refetch: () => Promise<unknown>
}

/**
 * One game, live: phones are views of the database. Any change to the game, its seats, rounds
 * or bonus lines refetches it (spec "Live score, lobby and spectating").
 */
export function useGame(gameId: string, options: { live?: boolean } = {}): UseGameResult {
  const { userId } = useSession()
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: qk.game(gameId),
    queryFn: () => fetchGameRows(gameId),
  })
  const realtime = useRealtimeInvalidate(
    `game-rows:${gameId}`,
    [
      { table: 'games', filter: `id=eq.${gameId}` },
      { table: 'game_seats', filter: `game_id=eq.${gameId}` },
      { table: 'rounds', filter: `game_id=eq.${gameId}` },
      // round_lines has no game_id; RLS limits events to games I can read.
      { table: 'round_lines' },
    ],
    [qk.game(gameId)],
    options.live !== false,
  )
  const view = query.data ? buildGameView(query.data.game, query.data.seats, query.data.rounds, userId, t('guest')) : null
  return { view, isPending: query.isPending, error: query.error, realtime, dataUpdatedAt: query.dataUpdatedAt, refetch: query.refetch }
}
