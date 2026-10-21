import { type Team, pointsToGo } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Score, TargetBar, TeamBadge, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import { type GameView, teamNames } from '../model'

interface TeamTotalProps {
  readonly view: GameView
  readonly team: Team
  /** Tap the score to enter a round with this team selected (scorers only). */
  readonly onPress?: (team: Team) => void
  /** The +100 exact-cut button for this deal (scorers only). */
  readonly cut?: CutControl
}

export interface CutControl {
  readonly bonus: number
  /** Teams with an exact cut in the current deal. */
  readonly cutBy: readonly Team[]
  readonly busy: boolean
  readonly onToggle: (team: Team) => void
}

function TeamTotal({ view, team, onPress, cut }: TeamTotalProps) {
  const { t } = useTranslation(['game', 'common'])
  const total = view.totals[team]
  const toGo = pointsToGo(total, view.config)
  const leading = total > view.totals[team === 'A' ? 'B' : 'A']
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => onPress?.(team)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? t('live.tapToEnter') : undefined}
      style={({ pressed }) => [styles.half, leading && { backgroundColor: teamSoft(team) }, pressed && { backgroundColor: color.raised }]}
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
      {cut ? <CutButton team={team} cut={cut} /> : null}
    </Pressable>
  )
}

/** Small +100 under the score: on = this team cut this deal (counted with the round). */
function CutButton({ team, cut }: { team: Team; cut: CutControl }) {
  const { t } = useTranslation(['game', 'common'])
  const on = cut.cutBy.includes(team)
  const points = formatSigned(cut.bonus)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: cut.busy }}
      accessibilityLabel={t('live.cutA11y', { team, points })}
      disabled={cut.busy}
      onPress={() => cut.onToggle(team)}
      hitSlop={8}
      style={({ pressed }) => [
        styles.cut,
        { borderColor: teamColor(team) },
        on && { backgroundColor: teamColor(team) },
        (pressed || cut.busy) && styles.cutPressed,
      ]}>
      <Text variant="label" tone={on ? color.onPrimary : teamColor(team)}>
        {on ? t('live.cutOn', { points }) : t('live.cutOff', { points })}
      </Text>
    </Pressable>
  )
}

/** Team A (start side) vs Team B (end side): the totals everyone at the table glances at. */
export function TotalsHeader({ view, onTeamPress, cut }: { view: GameView; onTeamPress?: (team: Team) => void; cut?: CutControl }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.board}>
      <View style={styles.row}>
        <TeamTotal view={view} team="A" onPress={onTeamPress} cut={cut} />
        <View style={styles.rule} />
        <TeamTotal view={view} team="B" onPress={onTeamPress} cut={cut} />
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
  cut: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  cutPressed: { opacity: 0.6 },
})
