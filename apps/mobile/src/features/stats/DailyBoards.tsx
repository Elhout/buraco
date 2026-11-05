import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Avatar, Card, EmptyState, ErrorText, Text } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { formatNumber } from '@/lib/format'
import { dayLabel } from '@/lib/gameWhen'
import { color, space } from '@/theme/tokens'
import { useDailyResults } from './api'
import { dailyBoards } from './daily'

/** Players tab, "Daily": one card per day the club played, its champion and everyone's won/lost. */
export function DailyBoards({ clubId, members, me }: { clubId: string; members: readonly Member[]; me: string }) {
  const { t, i18n } = useTranslation('players')
  const results = useDailyResults(clubId)
  const byId = new Map(members.map((m) => [m.userId, m]))
  const name = (id: string): string => (id === me ? t('you', { name: byId.get(id)?.name ?? '' }) : (byId.get(id)?.name ?? '—'))

  if (results.isPending) return <ActivityIndicator color={color.inkMuted} />
  if (results.error) return <ErrorText error={results.error} />
  const boards = dailyBoards(results.data)
  if (boards.length === 0) return <EmptyState icon="calendar-outline" title={t('daily.empty')} body={t('daily.emptyBody')} />

  return (
    <View style={styles.list}>
      {boards.map((b) => (
        <Card key={b.day} style={styles.card}>
          <View style={styles.head}>
            <Text variant="bodyStrong" style={styles.flex}>
              {dayLabel(b.day, i18n.language)}
            </Text>
            <Text variant="caption" tone={color.inkMuted}>
              {t('daily.games', { count: b.games, n: formatNumber(b.games) })}
            </Text>
          </View>
          {b.champions.length > 0 ? (
            <View style={styles.champion}>
              <Ionicons name="trophy" size={18} color={color.accent} />
              <Text variant="label" tone={color.accent} style={styles.flex} numberOfLines={2}>
                {t(b.champions.length > 1 ? 'daily.champions' : 'daily.champion', { names: b.champions.map(name).join(' · ') })}
              </Text>
            </View>
          ) : null}
          {b.players.map((p) => {
            const member = byId.get(p.userId)
            return (
              <View key={p.userId} style={styles.row}>
                <Avatar name={member?.name ?? '?'} url={member?.avatarUrl} size={32} />
                <Text variant="label" numberOfLines={1} style={styles.flex}>
                  {name(p.userId)}
                </Text>
                <Text variant="label" tone={color.success}>
                  {t('won', { n: formatNumber(p.wins) })}
                </Text>
                <Text variant="label" tone={color.inkFaint}>
                  ·
                </Text>
                <Text variant="label" tone={color.danger}>
                  {t('lost', { n: formatNumber(p.losses) })}
                </Text>
              </View>
            )
          })}
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  card: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  champion: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
})
