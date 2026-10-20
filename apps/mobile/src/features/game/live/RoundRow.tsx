import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Score, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import type { BonusChip, RoundRowModel } from './roundRows'

function useStatusText(row: RoundRowModel, isGhost: boolean): string {
  const { t } = useTranslation(['game', 'common'])
  switch (row.status) {
    case 'open':
      return t('rounds.open')
    case 'pending':
      return isGhost || !row.waitingFor ? t('rounds.pendingGhost') : t('rounds.pending', { team: row.waitingFor })
    case 'voided':
      return t('rounds.voided')
    case 'sending':
      return t('rounds.sending')
    case 'confirmed':
      return row.confirmedBy && row.enteredBy
        ? t('rounds.confirmed', { entered: row.enteredBy, confirmed: row.confirmedBy })
        : row.enteredBy
          ? t('rounds.entered', { name: row.enteredBy })
          : ''
  }
}

function Chip({ chip }: { chip: BonusChip }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={[styles.chip, { backgroundColor: teamSoft(chip.team) }]}>
      <Text variant="caption" tone={teamColor(chip.team)} numberOfLines={1}>
        {t('rounds.cut', { points: formatSigned(chip.points), name: chip.name })}
      </Text>
    </View>
  )
}

interface CellProps {
  readonly team: Team
  readonly value: number | null
  readonly chips: readonly BonusChip[]
  readonly struck: boolean
}

function Cell({ team, value, chips, struck }: CellProps) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.cell}>
      {value === null ? (
        <Text variant="scoreSm" tone={color.inkFaint}>
          {t('rounds.noScore')}
        </Text>
      ) : (
        <Score value={value} size="scoreSm" tone={struck ? color.inkFaint : teamColor(team)} style={struck ? styles.struck : undefined} />
      )}
      {chips.map((c) => (
        <Chip key={c.key} chip={c} />
      ))}
    </View>
  )
}

/** One deal: number, A score (start), B score (end), cut bonuses, and its confirmation status. */
export function RoundRow({ row, isGhost }: { row: RoundRowModel; isGhost: boolean }) {
  const { t } = useTranslation(['game', 'common'])
  const status = useStatusText(row, isGhost)
  const struck = row.status === 'voided'
  const muted = row.status !== 'confirmed'
  const a11y = t('rounds.rowA11y', {
    n: formatNumber(row.no),
    a: row.a === null ? t('rounds.noScore') : formatNumber(row.a),
    b: row.b === null ? t('rounds.noScore') : formatNumber(row.b),
    status,
  })
  return (
    <View style={[styles.row, muted && styles.rowMuted]} accessible accessibilityLabel={a11y}>
      <View style={styles.no}>
        <Text variant="label" tone={color.inkFaint}>
          {formatNumber(row.no)}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.cells}>
          <Cell team="A" value={row.a} chips={row.bonuses.filter((c) => c.team === 'A')} struck={struck} />
          <Cell team="B" value={row.b} chips={row.bonuses.filter((c) => c.team === 'B')} struck={struck} />
        </View>
        {status ? (
          <View style={styles.statusLine}>
            {row.status === 'sending' ? <ActivityIndicator size="small" color={color.inkMuted} /> : null}
            <Text variant="caption" tone={row.status === 'pending' ? color.warning : color.inkMuted} style={struck && styles.struck}>
              {status}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  rowMuted: { backgroundColor: color.sunken, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, borderStyle: 'dashed' },
  no: { width: 28, alignItems: 'center', paddingTop: space.xs },
  body: { flex: 1, gap: space.xs },
  cells: { flexDirection: 'row', gap: space.md },
  cell: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, maxWidth: '100%' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  struck: { textDecorationLine: 'line-through' },
})
