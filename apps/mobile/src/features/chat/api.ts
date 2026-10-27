import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import type { ChatRow } from './model'

/** How many recent messages the chat shows. */
export const CHAT_PAGE = 200

/** The club chat, newest first; refreshed live whenever someone posts. */
export function useChatMessages(clubId: string) {
  const query = useQuery({
    queryKey: qk.chat(clubId),
    queryFn: async (): Promise<ChatRow[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE)
      if (error) throw error
      return data
    },
  })
  useRealtimeInvalidate(`chat:${clubId}`, [{ table: 'chat_messages', filter: `club_id=eq.${clubId}` }], [qk.chat(clubId)])
  return query
}

export function useSendMessage(clubId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => rpc('send_chat_message', { p_club_id: clubId, p_body: body }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.chat(clubId) }),
  })
}
