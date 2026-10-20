import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Chevron, Row, Score, TeamBadge, Text } from '@/components/ui'
import { formatDate, formatNumber } from '@/lib/format'
import { color, space, teamColor } from '@/theme/tokens'
import type { HistoryBadge, HistoryItem } from './items'
import { teamLabel } from './items'
import { Pill, type PillTone } from './ui'

export const BADGE_STYLE: Record<
  HistoryBadge,
  { tone: PillTone; icon: 'checkmark-circle' | 'eye-off-outline' | 'time-outline' | 'close-circle-outline' }
> = {
  verified: { tone: 'success', icon: 'checkmark-circle' },
  ghost: { tone: 'ghost', icon: 'eye-off-outline' },
  partly: { tone: 'ghost', icon: 'time-outline' },
  abandoned: { tone: 'danger', icon: 'close-circle-outline' },
}

const accentOf = (item: HistoryItem): string => {
  if (item.badge === 'abandoned') return color.danger
  if (item.badge !== 'verified') return color.ghost
  return item.winner ? teamColor(item.winner) : color.lineStrong
}

function TeamLine({ item, team, names }: { item: HistoryItem; team: Team; names: string }) {
  const won = item.winner === team
  const dim = item.winner !== null && !won
  return (
    <Row gap={space.md}>
      <TeamBadge team={team} size="sm" />
      <Text variant={won ? 'bodyStrong' : 'body'} tone={dim ? color.inkMuted : color.ink} numberOfLines={1} style={styles.flex}>
        {names}
      </Text>
      {won ? <Ionicons name="trophy" size={16} color={teamColor(team)} /> : null}
      <View style={styles.score}>
        <Score value={item.totals[team]} size="scoreSm" tone={won ? teamColor(team) : color.inkMuted} />
      </View>
    </Row>
  )
}

export function HistoryCard({ item, onPress }: { item: HistoryItem; onPress: () => void }) {
  const { t, i18n } = useTranslation(['history', 'common'])
  const guest = t('common:guest')
  const names = { A: teamLabel(item.seats, 'A', guest), B: teamLabel(item.seats, 'B', guest) }
  const date = item.finishedAt ? formatDate(item.finishedAt, i18n.language) : ''
  const badge = t(`badge.${item.badge}`)
  const result = item.winner ? t('card.won', { team: t(`common:team.${item.winner}`) }) : t('card.noWinner')
  const label = t('card.a11y', {
    date,
    teamA: names.A,
    scoreA: formatNumber(item.totals.A),
    teamB: names.B,
    scoreB: formatNumber(item.totals.B),
    result,
    badge: item.tournament ? `${badge}, ${t('badge.tournament')}` : badge,
  })
  const style = BADGE_STYLE[item.badge]

  return (
    <Card onPress={onPress} accent={accentOf(item)} accessibilityLabel={label} style={styles.card}>
      <Row gap={space.sm} style={styles.top}>
        <Text variant="caption" tone={color.inkMuted} style={styles.flex}>
          {date}
        </Text>
        {item.tournament ? <Pill label={t('badge.tournament')} tone="neutral" icon="trophy-outline" /> : null}
        <Pill label={badge} tone={style.tone} icon={style.icon} />
      </Row>
      <View style={styles.teams}>
        <TeamLine item={item} team="A" names={names.A} />
        <TeamLine item={item} team="B" names={names.B} />
      </View>
      <Row gap={space.xs}>
        <Ionicons name="layers-outline" size={14} color={color.inkFaint} />
        <Text variant="caption" tone={color.inkFaint} style={styles.flex}>
          {t('card.rounds', { count: item.rounds, n: formatNumber(item.rounds) })}
        </Text>
        <Chevron />
      </Row>
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: space.sm, paddingStart: space.xl },
  top: { justifyContent: 'space-between' },
  teams: { gap: space.xs },
  score: { minWidth: 64, alignItems: 'flex-end' },
})
