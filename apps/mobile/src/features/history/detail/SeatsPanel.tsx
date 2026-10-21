import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Banner, Button, Card, PinSheet, TeamBadge, Text } from '@/components/ui'
import { verifyGhostSeat } from '@/features/game/actions'
import type { GameView, SeatView } from '@/features/game/model'
import { color, space, teamColor } from '@/theme/tokens'
import { Pill } from '../ui'

function SeatLine({ seat, ghost }: { seat: SeatView; ghost: boolean }) {
  const { t } = useTranslation(['history', 'common'])
  const status = seat.isGuest ? t('detail.seat.guest') : seat.verified ? t('detail.seat.verified') : t('detail.seat.unverified')
  const name = seat.isMe ? `${seat.name} (${t('detail.seat.you')})` : seat.name
  return (
    <View
      style={styles.seat}
      accessible
      accessibilityLabel={t('detail.seat.a11y', { name, team: t(`common:team.${seat.team}`), status: ghost ? status : '' })}>
      <Avatar name={seat.name} url={seat.avatarUrl} size={36} ring={teamColor(seat.team)} />
      <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
        {name}
      </Text>
      <TeamBadge team={seat.team} size="sm" />
      {ghost ? (
        <Pill
          label={status}
          tone={seat.isGuest ? 'neutral' : seat.verified ? 'success' : 'ghost'}
          icon={seat.isGuest ? 'person-outline' : seat.verified ? 'checkmark-circle' : 'eye-off-outline'}
        />
      ) : null}
    </View>
  )
}

export interface SeatsPanelProps {
  view: GameView
  userId: string
  /** Called after my seat was verified, to refresh the game, log, history and stats. */
  onVerified: () => void
}

/** Players with per-seat verification for ghost games, and the retro-verification action (spec: ghost mode). */
export function SeatsPanel({ view, userId, onVerified }: SeatsPanelProps) {
  const { t } = useTranslation(['history', 'common'])
  const [pinOpen, setPinOpen] = useState(false)
  const [done, setDone] = useState(false)
  // There is no PIN any more: nothing to verify.
  const canVerify = false

  return (
    <Card>
      <Text variant="label" tone={color.inkMuted}>
        {t('detail.players')}
      </Text>
      <View style={styles.list}>
        {view.seats.map((s) => (
          <SeatLine key={s.seat} seat={s} ghost={view.isGhost} />
        ))}
      </View>
      {done ? <Banner tone="success">{t('detail.verify.done')}</Banner> : null}
      {canVerify ? (
        <View style={styles.verify}>
          <Text variant="body" tone={color.ghost}>
            {t('detail.verify.body')}
          </Text>
          <Button label={t('detail.verify.button')} size="lg" block onPress={() => setPinOpen(true)} />
        </View>
      ) : null}
      <PinSheet
        visible={pinOpen}
        userId={userId}
        title={t('detail.verify.title')}
        subtitle={t('detail.verify.pinSubtitle')}
        onSubmit={(pin) => verifyGhostSeat(view.game.id, pin)}
        onSuccess={() => {
          setPinOpen(false)
          setDone(true)
          onVerified()
        }}
        onClose={() => setPinOpen(false)}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: space.sm },
  seat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.md },
  verify: { gap: space.md, paddingTop: space.sm },
})
