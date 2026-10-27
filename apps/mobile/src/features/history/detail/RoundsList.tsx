import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Card, Divider, Row, Score, Text } from '@/components/ui'
import type { Team } from '@buraco/shared'
import type { RoundView } from '@/features/game/model'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, space, teamColor } from '@/theme/tokens'
import { Pill } from '../ui'
import { runningTotals } from './runningTotals'

function RoundStatus({ round }: { round: RoundView }) {
  const { t } = useTranslation(['history', 'common'])
  if (round.status === 'voided') return <Pill label={t('detail.undone')} tone="warning" icon="arrow-undo-outline" />
  if (round.status === 'open' || round.status === 'pending') return <Pill label={t(`detail.roundStatus.${round.status}`)} tone="neutral" />
  if (round.editedAt !== null) return <Pill label={t('detail.edited')} tone="warning" icon="create-outline" />
  return null
}

interface RoundRowProps {
  round: RoundView
  /** The game score after this round; absent for rounds that don't count. */
  total?: Readonly<Record<Team, number>>
  onEdit?: (round: RoundView) => void
}

function RoundRow({ round, total, onEdit }: RoundRowProps) {
  const { t } = useTranslation(['history', 'common'])
  const voided = round.status === 'voided'
  const strike = voided ? styles.strike : null
  const a = round.teamA ?? 0
  const b = round.teamB ?? 0
  return (
    <View style={[styles.round, voided && styles.voided]}>
      <Row gap={space.sm}>
        <Text
          variant="bodyStrong"
          style={[styles.flex, strike]}
          accessibilityLabel={t('detail.roundA11y', { n: formatNumber(round.displayNo), a: formatNumber(a), b: formatNumber(b) })}>
          {t('common:round', { n: formatNumber(round.displayNo) })}
        </Text>
        <RoundStatus round={round} />
        <Score value={a} signed size="scoreSm" tone={voided ? color.inkFaint : teamColor('A')} style={[styles.num, strike]} />
        <Score value={b} signed size="scoreSm" tone={voided ? color.inkFaint : teamColor('B')} style={[styles.num, strike]} />
        {onEdit && round.status === 'confirmed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('detail.editRound', { n: formatNumber(round.displayNo) })}
            onPress={() => onEdit(round)}
            hitSlop={8}
            style={styles.edit}>
            <Ionicons name="pencil" size={16} color={color.inkMuted} />
          </Pressable>
        ) : null}
      </Row>
      {total ? (
        <View
          style={styles.totalRow}
          accessible
          accessibilityLabel={t('detail.totalA11y', { a: formatNumber(total.A), b: formatNumber(total.B) })}>
          <Text variant="caption" tone={color.inkFaint} style={styles.flex}>
            {t('detail.total')}
          </Text>
          <Text variant="label" tone={color.inkMuted} style={styles.num}>
            {formatNumber(total.A)}
          </Text>
          <Text variant="label" tone={color.inkMuted} style={styles.num}>
            {formatNumber(total.B)}
          </Text>
          {onEdit && round.status === 'confirmed' ? <View style={styles.edit} /> : null}
        </View>
      ) : null}
      {round.lines.map((l) => (
        <Text key={l.id} variant="caption" tone={voided ? color.inkFaint : teamColor(l.team)}>
          {t('detail.cut', { points: formatSigned(l.points), name: l.playerName })}
        </Text>
      ))}
      {round.enteredBy || round.confirmedBy ? (
        <Text variant="caption" tone={color.inkFaint}>
          {[
            round.enteredBy ? t('detail.enteredBy', { name: round.enteredBy.name }) : null,
            round.confirmedBy ? t('detail.confirmedBy', { name: round.confirmedBy.name }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  )
}

/** Every round with scores, exact-cut bonuses, who entered and who confirmed; undone rounds struck through. */
/** `onEdit` (owner only) adds a pencil to every confirmed round. */
export function RoundsList({ rounds, onEdit }: { rounds: readonly RoundView[]; onEdit?: (round: RoundView) => void }) {
  const { t } = useTranslation(['history', 'common'])
  const totals = runningTotals(rounds)
  return (
    <Card>
      <Text variant="label" tone={color.inkMuted}>
        {t('detail.rounds')}
      </Text>
      {rounds.length === 0 ? (
        <Text variant="body" tone={color.inkMuted}>
          {t('detail.noRounds')}
        </Text>
      ) : (
        rounds.map((r, i) => (
          <View key={r.id} style={styles.item}>
            {i > 0 ? <Divider /> : null}
            <RoundRow round={r} total={totals.get(r.id)} onEdit={onEdit} />
          </View>
        ))
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  edit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  item: { gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { gap: space.xxs },
  voided: { opacity: 0.7 },
  strike: { textDecorationLine: 'line-through' },
  num: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
})
