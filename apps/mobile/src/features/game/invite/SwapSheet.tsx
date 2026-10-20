import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, Button, ErrorText, ListRow, Sheet, Text } from '@/components/ui'
import { useClubMembers } from '@/features/clubs/members'
import { swapSeat } from '@/features/game/actions'
import type { SeatView } from '@/features/game/model'
import { useOnlineMembers } from '@/features/lobby/presence'
import { color, space } from '@/theme/tokens'
import { swapCandidates } from './model'

export interface SwapSheetProps {
  gameId: string
  clubId: string
  /** The seat being replaced; null hides the sheet. */
  seat: SeatView | null
  seats: readonly SeatView[]
  onClose: () => void
}

/** Host replaces an invited/declined player with any member not already at the table. */
export function SwapSheet({ gameId, clubId, seat, seats, onClose }: SwapSheetProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const { members, isPending, error, refetch } = useClubMembers(clubId)
  const online = useOnlineMembers(clubId)
  const mutation = useMutation({
    mutationFn: (userId: string) => swapSeat(gameId, seat?.seat ?? 0, userId),
    onSuccess: onClose,
  })
  const candidates = swapCandidates(members, seats)
  const close = (): void => {
    mutation.reset()
    onClose()
  }

  let body
  if (isPending || mutation.isPending) body = <ActivityIndicator color={color.inkMuted} style={styles.pad} />
  else if (error)
    body = (
      <View style={styles.pad}>
        <ErrorText error={error} />
        <Button label={t('common:actions.retry')} variant="secondary" onPress={() => void refetch()} />
      </View>
    )
  else if (candidates.length === 0)
    body = (
      <Text variant="body" tone={color.inkMuted} center style={styles.pad}>
        {t('invite.swapNone')}
      </Text>
    )
  else
    body = (
      <ScrollView style={styles.list}>
        {candidates.map((m) => (
          <ListRow
            key={m.userId}
            title={m.name}
            leading={<Avatar name={m.name} url={m.avatarUrl} size={40} online={online.has(m.userId)} />}
            onPress={() => mutation.mutate(m.userId)}
          />
        ))}
      </ScrollView>
    )

  return (
    <Sheet
      visible={seat !== null}
      onClose={close}
      title={t('invite.swapTitle', { name: seat?.name ?? '' })}
      subtitle={t('invite.swapSubtitle')}
      locked={mutation.isPending}>
      <ErrorText error={mutation.error} />
      {body}
      <Button label={t('common:actions.cancel')} variant="quiet" block disabled={mutation.isPending} onPress={close} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  pad: { paddingVertical: space.lg, gap: space.sm },
  list: { maxHeight: 360 },
})
