import type { Tables } from '@buraco/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export type CommentRow = Tables<'game_comments'>

const commentsKey = (gameId: string) => [...qk.game(gameId), 'comments'] as const

/** A game's comments, oldest first; live while the screen is open. */
export function useGameComments(gameId: string) {
  const query = useQuery({
    queryKey: commentsKey(gameId),
    queryFn: async (): Promise<CommentRow[]> => {
      const { data, error } = await supabase.from('game_comments').select('*').eq('game_id', gameId).order('created_at')
      if (error) throw error
      return data
    },
  })
  useRealtimeInvalidate(`comments:${gameId}`, [{ table: 'game_comments', filter: `game_id=eq.${gameId}` }], [commentsKey(gameId)])
  return query
}

export function useAddComment(gameId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ body, mentions }: { body: string; mentions: readonly string[] }) =>
      rpc('add_game_comment', { p_game_id: gameId, p_body: body, p_mentions: [...mentions] }),
    onSuccess: () => client.invalidateQueries({ queryKey: commentsKey(gameId) }),
  })
}
