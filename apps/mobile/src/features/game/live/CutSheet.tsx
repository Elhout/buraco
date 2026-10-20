import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, ErrorText, SectionTitle, Sheet, TeamBadge, Text } from '@/components/ui'
import { formatSigned } from '@/lib/format'
import { HIT, color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import { addCut, removeCut } from '../actions'
import type { GameView, LineView, SeatView } from '../model'
import { DealCuts } from './DealCuts'
import { useAction } from './useAction'

interface CutSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

interface PlayerButtonProps {
  readonly seat: SeatView
  readonly taken: boolean
  readonly busy: boolean
  readonly onPress: () => void
}

function PlayerButton({ seat, taken, busy, onPress }: PlayerButtonProps) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${seat.name}, ${t(`common:team.${seat.team}`)}`}
      accessibilityState={{ disabled: taken || busy }}
      disabled={taken || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.player,
        { borderColor: teamColor(seat.team), backgroundColor: pressed ? teamSoft(seat.team) : color.sunken },
        taken && styles.taken,
      ]}>
      <Avatar name={seat.name} url={seat.avatarUrl} size={36} ring={teamColor(seat.team)} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {seat.name}
        </Text>
        {taken ? (
          <Text variant="caption" tone={teamColor(seat.team)}>
            {t('cut.has')}
          </Text>
        ) : null}
      </View>
      <TeamBadge team={seat.team} size="sm" />
    </Pressable>
  )
}

/** +100 exact cut: pick the player; cuts already tapped this deal can be removed here. */
export function CutSheet({ visible, view, onClose }: CutSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  const [removing, setRemoving] = useState<string | null>(null)
  const lines = view.openRound?.lines ?? []
  const taken = new Set(lines.map((l) => l.seat))

  const add = async (seat: SeatView): Promise<void> => {
    if (!(await action.run(() => addCut(view.game.id, seat.seat)))) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onClose()
  }
  const remove = async (line: LineView): Promise<void> => {
    setRemoving(line.id)
    await action.run(() => removeCut(line.id))
    setRemoving(null)
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('cut.title')}
      subtitle={t('cut.subtitle', { points: formatSigned(view.config.cutBonus) })}>
      <View style={styles.columns}>
        {(['A', 'B'] as const).map((team) => (
          <View key={team} style={styles.column}>
            {view.seats
              .filter((s) => s.team === team)
              .map((s) => (
                <PlayerButton key={s.seat} seat={s} taken={taken.has(s.seat)} busy={action.busy} onPress={() => void add(s)} />
              ))}
          </View>
        ))}
      </View>
      <SectionTitle>{t('cut.thisDeal')}</SectionTitle>
      {lines.length === 0 ? (
        <Text variant="label" tone={color.inkFaint}>
          {t('cut.none')}
        </Text>
      ) : (
        <DealCuts lines={lines} busyId={removing} onRemove={(l) => void remove(l)} />
      )}
      <ErrorText error={action.error} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1, gap: space.sm },
  player: {
    minHeight: HIT + space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  taken: { opacity: 0.5 },
  flex: { flex: 1 },
})
