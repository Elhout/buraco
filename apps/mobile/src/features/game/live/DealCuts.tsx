import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { formatSigned } from '@/lib/format'
import { radius, space, teamColor, teamSoft } from '@/theme/tokens'
import type { LineView } from '../model'

interface DealCutsProps {
  readonly lines: readonly LineView[]
  /** When given, each cut gets a remove button (open deal only). */
  readonly onRemove?: (line: LineView) => void
  readonly busyId?: string | null
}

/** The exact-cut bonuses tapped in the deal being played, in team colours. */
export function DealCuts({ lines, onRemove, busyId }: DealCutsProps) {
  const { t } = useTranslation(['game', 'common'])
  if (lines.length === 0) return null
  return (
    <View style={styles.wrap}>
      {lines.map((line) => (
        <View key={line.id} style={[styles.chip, { backgroundColor: teamSoft(line.team), borderColor: teamColor(line.team) }]}>
          <Text variant="label" tone={teamColor(line.team)} numberOfLines={1} style={styles.label}>
            {t('rounds.cut', { points: formatSigned(line.points), name: line.playerName })}
          </Text>
          {onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('cut.remove', { name: line.playerName })}
              disabled={busyId === line.id}
              hitSlop={8}
              onPress={() => onRemove(line)}
              style={styles.remove}>
              <Ionicons name="close" size={18} color={teamColor(line.team)} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingStart: space.md,
    paddingEnd: space.xs,
    minHeight: 36,
  },
  label: { flexShrink: 1, paddingEnd: space.xs },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
