import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Card, Chevron, EmptyState, Score, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { color, space, teamColor } from '@/theme/tokens'
import { type RoundRow } from './model'

/** Rounds, newest first: each deal's points (signed) and the running totals. Tap a round to fix it. */
export function QuickRoundList({ rows, onEdit }: { rows: readonly RoundRow[]; onEdit: (index: number) => void }) {
  const { t } = useTranslation('quick')
  if (rows.length === 0) return <EmptyState icon="albums-outline" title={t('noRounds')} />
  return (
    <Card style={styles.card}>
      {rows.map((row, i) => (
        <Pressable
          key={row.index}
          accessibilityRole="button"
          accessibilityLabel={t('editA11y', { n: formatNumber(row.n) })}
          onPress={() => onEdit(row.index)}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: color.raised }]}>
          <Text variant="label" tone={color.inkMuted} style={styles.label}>
            {t('roundRow', { n: formatNumber(row.n) })}
          </Text>
          {(['A', 'B'] as const).map((team) => (
            <View key={team} style={styles.cell}>
              <Score value={team === 'A' ? row.round.a : row.round.b} size="scoreSm" signed tone={teamColor(team)} />
              <Text variant="caption" tone={color.inkFaint}>
                {formatNumber(row.totals[team])}
              </Text>
            </View>
          ))}
          <Chevron />
        </Pressable>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  label: { width: 72 },
  cell: { flex: 1, alignItems: 'center' },
})
