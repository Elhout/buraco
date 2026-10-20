import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Row, Score, TeamBadge, Text } from '@/components/ui'
import { type GameView, teamNames } from '@/features/game/model'
import { formatDate, formatNumber } from '@/lib/format'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'

function TeamColumn({ view, team }: { view: GameView; team: Team }) {
  const { t } = useTranslation(['history', 'common'])
  const winner = view.game.winner_team
  const won = winner === team
  const value = view.totals[team]
  return (
    <View
      style={[styles.column, won && { backgroundColor: teamSoft(team) }]}
      accessible
      accessibilityLabel={`${t(`common:team.${team}`)}: ${teamNames(view, team)}, ${formatNumber(value)}${won ? `, ${t('detail.winner', { team: t(`common:team.${team}`) })}` : ''}`}>
      <Row gap={space.xs}>
        <TeamBadge team={team} size="sm" />
        {won ? <Ionicons name="trophy" size={16} color={teamColor(team)} /> : null}
      </Row>
      <Score value={value} size="score" tone={won || winner === null ? teamColor(team) : color.inkMuted} />
      <Text variant="label" tone={won ? color.ink : color.inkMuted} numberOfLines={2}>
        {teamNames(view, team)}
      </Text>
    </View>
  )
}

/** Final (or current) totals for both teams with the winner emphasized. */
export function ScoreHeader({ view }: { view: GameView }) {
  const { t, i18n } = useTranslation(['history', 'common'])
  const winner = view.game.winner_team
  const when = view.game.finished_at ?? view.game.started_at ?? view.game.created_at
  return (
    <Card accent={view.isGhost && !view.game.verified ? color.ghost : winner ? teamColor(winner) : undefined}>
      <Row gap={space.sm}>
        <Text variant="caption" tone={color.inkMuted} style={styles.flex}>
          {t('detail.playedOn', { date: formatDate(when, i18n.language) })}
        </Text>
        <Text variant="caption" tone={color.inkMuted}>
          {t(`common:status.${view.game.status}`)}
        </Text>
      </Row>
      <Row gap={space.sm} style={styles.columns}>
        <TeamColumn view={view} team="A" />
        <TeamColumn view={view} team="B" />
      </Row>
      <Text variant="title" tone={winner ? teamColor(winner) : color.inkMuted} center>
        {winner ? t('detail.winner', { team: t(`common:team.${winner}`) }) : t('detail.noWinner')}
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  columns: { alignItems: 'stretch' },
  column: { flex: 1, gap: space.xs, padding: space.md, borderRadius: radius.md },
})
