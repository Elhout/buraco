import type { Tables } from '@buraco/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import type { Reaction, ReactionRow } from './reactions'

export type CommentRow = Tables<'game_comments'>

const commentsKey = (gameId: string) => [...qk.game(gameId), 'comments'] as const

/** Comments are conversation: no 30 s grace period, refetch on open, and a 15 s safety poll. */
const FRESH = { staleTime: 0, refetchOnMount: 'always', refetchInterval: 15_000 } as const

/** A game's comments, oldest first; live while the screen is open. */
export function useGameComments(gameId: string) {
  const query = useQuery({
    queryKey: commentsKey(gameId),
    // Opening the game (often from a comment push) must show that comment at once: always refetch
    // instead of trusting the cache, and poll gently in case the live connection is down.
    ...FRESH,
    queryFn: async (): Promise<CommentRow[]> => {
      const { data, error } = await supabase.from('game_comments').select('*').eq('game_id', gameId).order('created_at')
      if (error) throw error
      return data
    },
  })
  useRealtimeInvalidate(`comments:${gameId}`, [{ table: 'game_comments', filter: `game_id=eq.${gameId}` }], [commentsKey(gameId)])
  return query
}

const reactionsKey = (gameId: string) => [...qk.game(gameId), 'reactions'] as const

/** Every reaction on this game's comments; live while the screen is open. */
export function useGameReactions(gameId: string) {
  const query = useQuery({
    queryKey: reactionsKey(gameId),
    ...FRESH,
    queryFn: async (): Promise<ReactionRow[]> => {
      const { data, error } = await supabase.from('comment_reactions').select('comment_id, user_id, emoji').eq('game_id', gameId)
      if (error) throw error
      return data
    },
  })
  useRealtimeInvalidate(`reactions:${gameId}`, [{ table: 'comment_reactions', filter: `game_id=eq.${gameId}` }], [reactionsKey(gameId)])
  return query
}

/** Adds the reaction, or takes it back when it was already mine. */
export function useToggleReaction(gameId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: Reaction }) =>
      rpc('toggle_comment_reaction', { p_comment_id: commentId, p_emoji: emoji }),
    onSuccess: () => client.invalidateQueries({ queryKey: reactionsKey(gameId) }),
  })
}

export function useAddComment(gameId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ body, mentions, audio }: { body: string; mentions: readonly string[]; audio?: { path: string; seconds: number } }) =>
      rpc('add_game_comment', {
        p_game_id: gameId,
        p_body: body,
        p_mentions: [...mentions],
        ...(audio ? { p_audio_path: audio.path, p_audio_seconds: audio.seconds } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: commentsKey(gameId) }),
  })
}
