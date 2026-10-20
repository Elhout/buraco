import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Button, TeamBadge, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { HIT, color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import { type SeatNo, type Slots, TEAM_SEATS, nextFreeSeat } from './draft'

interface SlotProps {
  seat: SeatNo
  team: Team
  slots: Slots
  meId: string
  onClear: (seat: SeatNo) => void
}

function SeatSlot({ seat, team, slots, meId, onClear }: SlotProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const player = slots[seat - 1] ?? null
  const isNext = nextFreeSeat(slots) === seat
  const seatNo = formatNumber(seat)

  if (!player) {
    return (
      <View
        style={[styles.slot, styles.empty, isNext && { borderColor: teamColor(team) }]}
        accessible
        accessibilityLabel={`${t('new.seatEmpty', { seat: seatNo })}. ${t('new.seatHint')}`}>
        <Ionicons name="person-add-outline" size={20} color={isNext ? teamColor(team) : color.inkFaint} />
        <Text variant="caption" tone={isNext ? teamColor(team) : color.inkFaint} numberOfLines={1}>
          {t('new.seatEmpty', { seat: seatNo })}
        </Text>
      </View>
    )
  }

  const name = player.kind === 'member' && player.userId === meId ? t('common:you') : player.name
  return (
    <Pressable
      onPress={() => onClear(seat)}
      accessibilityRole="button"
      accessibilityLabel={t('new.seatClear', { name: player.name, seat: seatNo })}
      style={({ pressed }) => [styles.slot, { backgroundColor: teamSoft(team), borderColor: teamColor(team) }, pressed && styles.pressed]}>
      <Avatar name={player.name} size={36} ring={teamColor(team)} />
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone={color.inkMuted} numberOfLines={1}>
          {player.kind === 'guest' ? t('common:guest') : t('new.seated', { seat: seatNo })}
        </Text>
      </View>
      <Ionicons name="close" size={18} color={color.inkMuted} />
    </Pressable>
  )
}

export interface TeamPanelsProps {
  slots: Slots
  meId: string
  onClear: (seat: SeatNo) => void
  onSwap: () => void
  onShuffle: () => void
}

/** Team A (seats 1 & 3) beside Team B (seats 2 & 4), the way the table sits. */
export function TeamPanels({ slots, meId, onClear, onSwap, onShuffle }: TeamPanelsProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const any = slots.some((p) => p !== null)
  return (
    <View style={styles.wrap}>
      <View style={styles.panels}>
        {(['A', 'B'] as const).map((team) => (
          <View key={team} style={[styles.panel, { borderTopColor: teamColor(team) }]}>
            <View style={styles.panelHead}>
              <TeamBadge team={team} size="sm" />
              <Text variant="label" tone={teamColor(team)}>
                {t(`common:team.${team}`)}
              </Text>
            </View>
            {TEAM_SEATS[team].map((seat) => (
              <SeatSlot key={seat} seat={seat} team={team} slots={slots} meId={meId} onClear={onClear} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button
          label={t('new.swapTeams')}
          variant="secondary"
          disabled={!any}
          onPress={onSwap}
          icon={<Ionicons name="swap-horizontal" size={18} color={color.ink} />}
        />
        <Button
          label={t('new.shuffle')}
          variant="secondary"
          disabled={!any}
          onPress={onShuffle}
          icon={<Ionicons name="shuffle" size={18} color={color.ink} />}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.md },
  panels: { flexDirection: 'row', gap: space.sm },
  panel: {
    flex: 1,
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderTopWidth: 3,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.xs },
  slot: {
    minHeight: HIT + space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  empty: { borderStyle: 'dashed', borderColor: color.lineStrong, justifyContent: 'center', backgroundColor: color.sunken },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
})
