import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, Button, ErrorText, Sheet, TeamBadge, Text } from '@/components/ui'
import { useClubMembers } from '@/features/clubs/members'
import i18n from '@/i18n'
import { HIT, color, radius, space } from '@/theme/tokens'
import { type Player, type SeatNo, type Slots, seatOf, teamOfSeat } from './draft'

export interface SeatPickerSheetProps {
  clubId: string
  meId: string
  /** The seat being filled; null closes the sheet. */
  seat: SeatNo | null
  slots: Slots
  onPick: (seat: SeatNo, player: Player) => void
  /** Owners and admins can create someone who isn't a player yet. */
  onNewPlayer?: () => void
  onClose: () => void
}

/**
 * Tapping an empty seat on New game: the players you already have, to put in that seat. Someone
 * already seated elsewhere moves here. "New player" is only for people without an account yet.
 */
export function SeatPickerSheet({ clubId, meId, seat, slots, onPick, onNewPlayer, onClose }: SeatPickerSheetProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const { members, isPending, error } = useClubMembers(clubId)
  const team = seat ? teamOfSeat(seat) : 'A'
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, i18n.language))

  return (
    <Sheet visible={seat !== null} onClose={onClose} title={t('new.pickTitle', { team })}>
      {isPending ? <ActivityIndicator color={color.inkMuted} /> : null}
      <ErrorText error={error} />
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {sorted.map((m) => {
          const player: Player = { kind: 'member', userId: m.userId, name: m.name }
          const current = seatOf(slots, player)
          return (
            <Pressable
              key={m.userId}
              accessibilityRole="button"
              accessibilityLabel={m.name}
              onPress={() => seat && onPick(seat, player)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Avatar name={m.name} url={m.avatarUrl} size={40} />
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {m.userId === meId ? `${m.name} · ${t('common:you')}` : m.name}
              </Text>
              {current ? <TeamBadge team={teamOfSeat(current)} size="sm" /> : null}
            </Pressable>
          )
        })}
        {!isPending && members.length <= 1 ? (
          <Text variant="label" tone={color.inkMuted} center style={styles.hint}>
            {onNewPlayer ? t('new.aloneBody') : t('new.aloneAsk')}
          </Text>
        ) : null}
      </ScrollView>
      {onNewPlayer ? (
        <View style={styles.footer}>
          <Button
            label={t('new.newPlayer')}
            variant="secondary"
            block
            icon={<Ionicons name="person-add-outline" size={18} color={color.ink} />}
            onPress={onNewPlayer}
          />
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { maxHeight: 420 },
  listContent: { gap: space.xxs },
  row: {
    minHeight: HIT + space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: color.raised },
  hint: { paddingVertical: space.lg },
  footer: { paddingTop: space.sm },
})
