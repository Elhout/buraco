import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Avatar, Button, Card, Chevron, ErrorText, ListRow, Screen } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { AddPlayerSheet } from '@/features/clubs/screens/AddPlayerSheet'
import { RoleChip } from '@/features/clubs/screens/RoleChip'
import { buildRoster } from '@/features/players/roster'
import { useClubPlayerStats, useStatsLive } from '@/features/stats/api'
import i18n from '@/i18n'
import { formatNumber } from '@/lib/format'
import { color, space } from '@/theme/tokens'

/** Players tab: everyone in the club with games and wins, best first. Owners and admins add players. */
export default function PlayersScreen() {
  const { t } = useTranslation('players')
  const me = useUserId()
  const current = useCurrentClub()
  const members = useClubMembers(current.club.id)
  const stats = useClubPlayerStats(current.club.id)
  const [adding, setAdding] = useState(false)
  useStatsLive(current.club.id)
  const isAdmin = current.role === 'owner' || current.role === 'admin'
  const roster = buildRoster(members.members, stats.data ?? [], i18n.language)

  const refresh = (): void => {
    void members.refetch()
    void stats.refetch()
  }

  return (
    <Screen
      title={t('title')}
      subtitle={t('subtitle', { count: roster.length, n: formatNumber(roster.length) })}
      refreshing={false}
      onRefresh={refresh}
      actions={isAdmin ? <Button label={t('add')} onPress={() => setAdding(true)} /> : undefined}>
      {members.isPending ? <ActivityIndicator color={color.inkMuted} /> : null}
      <ErrorText error={members.error ?? stats.error} />
      {roster.length > 0 ? (
        <Card style={styles.card}>
          {roster.map((p) => (
            <ListRow
              key={p.userId}
              title={p.userId === me ? t('you', { name: p.name }) : p.name}
              subtitle={
                p.games === 0 ? t('noGames') : t('record', { games: formatNumber(p.games), wins: formatNumber(p.wins), count: p.games })
              }
              leading={<Avatar name={p.name} url={p.avatarUrl} size={44} />}
              trailing={
                <>
                  {p.role === 'member' ? null : <RoleChip role={p.role} />}
                  <Chevron />
                </>
              }
              onPress={() => router.push({ pathname: '/player/[id]', params: { id: p.userId } })}
            />
          ))}
        </Card>
      ) : null}
      {isAdmin ? <AddPlayerSheet clubId={current.club.id} visible={adding} onClose={() => setAdding(false)} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.xxs, paddingVertical: space.sm },
})
