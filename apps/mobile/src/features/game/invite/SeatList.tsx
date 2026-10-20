import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Button, Card, TeamBadge, Text } from '@/components/ui'
import type { SeatView } from '@/features/game/model'
import { Chip, type ChipTone } from '@/features/lobby/Chip'
import { color, space, teamColor } from '@/theme/tokens'

const statusTone: Record<SeatView['inviteStatus'], { tone: ChipTone; icon: keyof typeof Ionicons.glyphMap }> = {
  invited: { tone: 'inviting', icon: 'hourglass-outline' },
  confirmed: { tone: 'live', icon: 'checkmark' },
  declined: { tone: 'neutral', icon: 'close' },
}

interface SeatRowProps {
  seat: SeatView
  hostId: string | null
  onSwap?: (seat: SeatView) => void
}

function SeatRow({ seat, hostId, onSwap }: SeatRowProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const status = t(`invite.status.${seat.inviteStatus}`)
  const name = seat.isMe ? t('common:you') : seat.name
  const declined = seat.inviteStatus === 'declined'
  return (
    <View style={styles.row}>
      <View
        style={styles.who}
        accessible
        accessibilityLabel={t('invite.seatLabel', { name: seat.name, team: t(`common:team.${seat.team}`), status })}>
        <Avatar name={seat.name} url={seat.avatarUrl} size={44} ring={declined ? color.inkFaint : teamColor(seat.team)} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1} tone={declined ? color.inkMuted : color.ink}>
            {name}
          </Text>
          <View style={styles.chips}>
            <Chip tone={statusTone[seat.inviteStatus].tone} icon={statusTone[seat.inviteStatus].icon} label={status} />
            {seat.userId !== null && seat.userId === hostId ? <Chip tone="neutral" icon="star-outline" label={t('invite.host')} /> : null}
          </View>
        </View>
      </View>
      {onSwap ? (
        <Button
          label={t('invite.swap')}
          variant="secondary"
          accessibilityLabel={t('invite.swapLabel', { name: seat.name })}
          onPress={() => onSwap(seat)}
          icon={<Ionicons name="swap-horizontal" size={16} color={color.ink} />}
        />
      ) : null}
    </View>
  )
}

export interface SeatListProps {
  seats: readonly SeatView[]
  hostId: string | null
  canSwap: (seat: SeatView) => boolean
  onSwap: (seat: SeatView) => void
}

/** The four seats by team, each with its invite status; the host gets a Swap on open seats. */
export function SeatList({ seats, hostId, canSwap, onSwap }: SeatListProps) {
  const { t } = useTranslation(['lobby', 'common'])
  return (
    <View style={styles.teams}>
      {(['A', 'B'] as const satisfies readonly Team[]).map((team) => (
        <Card key={team} accent={teamColor(team)} style={styles.card}>
          <View style={styles.head}>
            <TeamBadge team={team} size="sm" />
            <Text variant="label" tone={teamColor(team)}>
              {t(`common:team.${team}`)}
            </Text>
          </View>
          {seats
            .filter((s) => s.team === team)
            .map((s) => (
              <SeatRow key={s.seat} seat={s} hostId={hostId} onSwap={canSwap(s) ? onSwap : undefined} />
            ))}
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xs },
  teams: { gap: space.md },
  card: { paddingStart: space.xl, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
})
