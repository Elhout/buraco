import { type Team, pointsToGo } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Score, TargetBar, TeamBadge, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import { type GameView, teamNames } from '../model'

interface TeamTotalProps {
  readonly view: GameView
  readonly team: Team
}

function TeamTotal({ view, team }: TeamTotalProps) {
  const { t } = useTranslation(['game', 'common'])
  const total = view.totals[team]
  const toGo = pointsToGo(total, view.config)
  const leading = total > view.totals[team === 'A' ? 'B' : 'A']
  return (
    <View
      style={[styles.half, leading && { backgroundColor: teamSoft(team) }]}
      accessible
      accessibilityLabel={t('live.totalA11y', { team, total: formatNumber(total), toGo: formatNumber(toGo) })}>
      <View style={styles.teamLine}>
        <TeamBadge team={team} size="sm" />
        <Text variant="caption" tone={color.inkMuted} numberOfLines={2} style={styles.names}>
          {teamNames(view, team)}
        </Text>
      </View>
      <Score value={total} size="scoreXl" tone={teamColor(team)} adjustsFontSizeToFit numberOfLines={1} />
      <TargetBar team={team} value={total} target={view.config.targetScore} />
      <Text variant="label" tone={toGo === 0 ? teamColor(team) : color.inkMuted}>
        {toGo === 0 ? t('live.atTarget') : t('live.toGo', { points: formatNumber(toGo) })}
      </Text>
    </View>
  )
}

/** Team A (start side) vs Team B (end side): the totals everyone at the table glances at. */
export function TotalsHeader({ view }: { view: GameView }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.board}>
      <View style={styles.row}>
        <TeamTotal view={view} team="A" />
        <View style={styles.rule} />
        <TeamTotal view={view} team="B" />
      </View>
      <Text variant="caption" tone={color.inkFaint} center>
        {t('live.target', { points: formatNumber(view.config.targetScore) })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    paddingBottom: space.sm,
    overflow: 'hidden',
    gap: space.xs,
  },
  row: { flexDirection: 'row' },
  half: { flex: 1, padding: space.lg, gap: space.sm },
  rule: { width: StyleSheet.hairlineWidth, backgroundColor: color.lineStrong, marginVertical: space.lg },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  names: { flex: 1 },
})
