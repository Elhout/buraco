import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Card, Chevron, EmptyState, Score, TeamBadge, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, space, teamColor } from '@/theme/tokens'
import { QUICK_CUT_BONUS, type RoundRow, leadOf, roundPoints } from './model'

/**
 * Rounds, newest first: each deal's points (signed), the running totals and the difference after
 * that round (who leads, by how much). Tap a round to fix it.
 */
export function QuickRoundList({
  rows,
  onEdit,
  onRemove,
}: {
  rows: readonly RoundRow[]
  onEdit: (index: number) => void
  /** Removes a +100 bonus row tapped by mistake. */
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation('quick')
  if (rows.length === 0) return <EmptyState icon="albums-outline" title={t('noRounds')} />
  return (
    <Card style={styles.card}>
      <View style={styles.header} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.label} />
        <View style={styles.cell}>
          <TeamBadge team="A" size="sm" />
        </View>
        <View style={styles.cell}>
          <TeamBadge team="B" size="sm" />
        </View>
        <Text variant="caption" tone={color.inkMuted} style={[styles.cell, styles.center]}>
          {t('difference')}
        </Text>
        <View style={styles.chevron} />
      </View>
      {rows.map((row) =>
        row.bonus ? (
          <View key={row.index} style={[styles.row, styles.divider]}>
            <Text variant="label" tone={color.inkMuted} style={styles.label}>
              {t('cutRow')}
            </Text>
            {(['A', 'B'] as const).map((team) => (
              <View key={team} style={styles.cell}>
                {row.round.cut === team ? <Score value={QUICK_CUT_BONUS} size="scoreSm" signed tone={teamColor(team)} /> : null}
                <Text variant="caption" tone={color.inkFaint}>
                  {formatNumber(row.totals[team])}
                </Text>
              </View>
            ))}
            <Difference totals={row.totals} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('removeCut')}
              onPress={() => onRemove(row.index)}
              hitSlop={8}
              style={styles.chevron}>
              <Ionicons name="close" size={18} color={color.inkMuted} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            key={row.index}
            accessibilityRole="button"
            accessibilityLabel={t('editA11y', { n: formatNumber(row.n) })}
            onPress={() => onEdit(row.index)}
            style={({ pressed }) => [styles.row, styles.divider, pressed && { backgroundColor: color.raised }]}>
            <Text variant="label" tone={color.inkMuted} style={styles.label}>
              {t('roundRow', { n: formatNumber(row.n) })}
            </Text>
            {(['A', 'B'] as const).map((team) => (
              <View key={team} style={styles.cell}>
                <Score value={roundPoints(row.round, team)} size="scoreSm" signed tone={teamColor(team)} />
                {row.round.cut === team ? (
                  <Text variant="caption" tone={teamColor(team)}>
                    {t('cutTag', { points: formatSigned(QUICK_CUT_BONUS) })}
                  </Text>
                ) : null}
                <Text variant="caption" tone={color.inkFaint}>
                  {formatNumber(row.totals[team])}
                </Text>
              </View>
            ))}
            <Difference totals={row.totals} />
            <Chevron />
          </Pressable>
        ),
      )}
    </Card>
  )
}

/** Leader's badge and the gap in their colour, or "Level" when the totals are equal. */
function Difference({ totals }: { totals: RoundRow['totals'] }) {
  const { t } = useTranslation('quick')
  const lead = leadOf(totals)
  if (!lead.team) {
    return (
      <Text variant="label" tone={color.inkMuted} style={[styles.cell, styles.center]}>
        {t('level')}
      </Text>
    )
  }
  return (
    <View
      style={[styles.cell, styles.lead]}
      accessible
      accessibilityLabel={t('leadA11y', { team: lead.team, points: formatNumber(lead.margin) })}>
      <TeamBadge team={lead.team} size="sm" />
      <Text variant="label" tone={teamColor(lead.team)}>
        {formatNumber(lead.margin)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs, paddingBottom: space.xs },
  label: { width: 64 },
  center: { textAlign: 'center' },
  lead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  chevron: { width: 20 },
  cell: { flex: 1, alignItems: 'center' },
})
