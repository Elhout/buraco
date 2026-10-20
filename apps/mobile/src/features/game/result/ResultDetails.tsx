import type { Team } from '@buraco/shared'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, SectionTitle, TeamBadge, Text } from '@/components/ui'
import { color, space, teamColor } from '@/theme/tokens'
import { type GameView, teamSeats } from '../model'
import type { ResultSummary } from './resultModel'

function TeamPlayers({ view, team }: { view: GameView; team: Team }) {
  return (
    <View style={styles.team}>
      <TeamBadge team={team} size="sm" />
      {teamSeats(view, team).map((s) => (
        <View key={s.seat} style={styles.player}>
          <Avatar name={s.name} url={s.avatarUrl} size={36} ring={teamColor(team)} />
          <Text variant="label" numberOfLines={1} style={styles.flex}>
            {s.name}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function Players({ view }: { view: GameView }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.section}>
      <SectionTitle>{t('result.players')}</SectionTitle>
      <View style={styles.columns}>
        <TeamPlayers view={view} team="A" />
        <TeamPlayers view={view} team="B" />
      </View>
    </View>
  )
}

/** Per-team confirmation of the proposed result (result_confirmed_teams). */
export function Confirmations({ summary }: { summary: ResultSummary }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <Card tone="sunken">
      <SectionTitle>{t('result.confirmations')}</SectionTitle>
      {(['A', 'B'] as const).map((team) => {
        const done = summary.confirmed[team]
        return (
          <View key={team} style={styles.confirmRow} accessible>
            <TeamBadge team={team} size="sm" />
            <Text variant="bodyStrong" style={styles.flex}>
              {t(`common:team.${team}`)}
            </Text>
            <Ionicons name={done ? 'checkmark-circle' : 'time-outline'} size={20} color={done ? color.success : color.inkMuted} />
            <Text variant="label" tone={done ? color.success : color.inkMuted}>
              {done ? t('result.teamConfirmed') : t('result.teamWaiting')}
            </Text>
          </View>
        )
      })}
    </Card>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  columns: { flexDirection: 'row', gap: space.md },
  team: { flex: 1, gap: space.sm },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  flex: { flex: 1 },
})
