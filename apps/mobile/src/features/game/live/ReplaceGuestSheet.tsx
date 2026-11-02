import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, ErrorText, ListRow, Sheet, TeamBadge, Text } from '@/components/ui'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { useOnlineMembers } from '@/features/lobby/presence'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { color, space } from '@/theme/tokens'
import { isGameAdmin } from '../AdminGameControls'
import type { GameView } from '../model'

/** The game's creator, the owner and admins can hand a guest's seat to a club member. */
export const canReplaceGuest = (view: GameView, role: string): boolean =>
  view.game.status === 'live' && view.seats.some((s) => s.isGuest) && (view.isHost || isGameAdmin(role))

interface ReplaceGuestSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

/** Pick the guest's seat (when there are several), then the member who takes it. Rounds played stay. */
export function ReplaceGuestSheet({ visible, view, onClose }: ReplaceGuestSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const { club } = useCurrentClub()
  const client = useQueryClient()
  const members = useClubMembers(club.id)
  const online = useOnlineMembers(club.id)
  const guests = view.seats.filter((s) => s.isGuest)
  const [picked, setPicked] = useState<number | null>(null)
  const seat = guests.length === 1 ? guests[0]! : (guests.find((g) => g.seat === picked) ?? null)
  const seated = new Set(view.seats.flatMap((s) => (s.userId ? [s.userId] : [])))
  const candidates = members.members
    .filter((m) => !seated.has(m.userId))
    .sort((a, b) => Number(online.has(b.userId)) - Number(online.has(a.userId)) || a.name.localeCompare(b.name))

  const replace = useMutation({
    mutationFn: async (userId: string) => {
      if (!seat) return
      await rpc('replace_guest', { p_game_id: view.game.id, p_seat: seat.seat, p_user_id: userId })
      await client.invalidateQueries({ queryKey: qk.game(view.game.id) })
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPicked(null)
      onClose()
    },
  })
  const close = (): void => {
    setPicked(null)
    replace.reset()
    onClose()
  }

  if (!seat) {
    return (
      <Sheet visible={visible} onClose={close} title={t('replaceGuest.title')} subtitle={t('replaceGuest.pickGuest')}>
        <View>
          {guests.map((g) => (
            <ListRow key={g.seat} title={g.name} leading={<TeamBadge team={g.team} />} onPress={() => setPicked(g.seat)} />
          ))}
        </View>
      </Sheet>
    )
  }
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('replaceGuest.titleFor', { name: seat.name })}
      subtitle={t('replaceGuest.body', { team: seat.team })}
      locked={replace.isPending}>
      <ErrorText error={replace.error} />
      {candidates.length === 0 ? (
        <Text variant="body" tone={color.inkMuted} center>
          {t('replaceGuest.nobody')}
        </Text>
      ) : (
        <ScrollView style={styles.list}>
          {candidates.map((m) => (
            <ListRow
              key={m.userId}
              title={m.name}
              leading={<Avatar name={m.name} url={m.avatarUrl} size={40} online={online.has(m.userId)} />}
              trailing={<TeamBadge team={seat.team} size="sm" />}
              onPress={replace.isPending ? undefined : () => replace.mutate(m.userId)}
            />
          ))}
        </ScrollView>
      )}
      {guests.length > 1 ? <ListRow title={t('replaceGuest.otherGuest')} onPress={() => setPicked(null)} /> : null}
      <View style={styles.spacer} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  spacer: { height: space.xs },
})
