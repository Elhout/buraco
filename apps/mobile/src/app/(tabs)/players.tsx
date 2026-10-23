import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Button, Card, Chevron, ErrorText, Screen, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { type Member, useClubMembers } from '@/features/clubs/members'
import { AddPlayerSheet } from '@/features/clubs/screens/AddPlayerSheet'
import { RoleChip } from '@/features/clubs/screens/RoleChip'
import { type RosterRow, buildRoster } from '@/features/players/roster'
import { useClubH2H, useClubPlayerStats, useStatsLive } from '@/features/stats/api'
import { type H2HRow, mostBeaten } from '@/features/stats/select'
import i18n from '@/i18n'
import { formatNumber } from '@/lib/format'
import { color, space } from '@/theme/tokens'

/** Players tab: the club leaderboard. Wins and losses per player and the opponent each beats most. */
export default function PlayersScreen() {
  const { t } = useTranslation('players')
  const current = useCurrentClub()
  const members = useClubMembers(current.club.id)
  const stats = useClubPlayerStats(current.club.id)
  const h2h = useClubH2H(current.club.id)
  const [adding, setAdding] = useState(false)
  useStatsLive(current.club.id)
  const isAdmin = current.role === 'owner' || current.role === 'admin'
  const roster = buildRoster(members.members, stats.data ?? [], i18n.language)

  const refresh = (): void => {
    void members.refetch()
    void stats.refetch()
    void h2h.refetch()
  }

  return (
    <Screen
      title={t('title')}
      subtitle={t('subtitle', { count: roster.length, n: formatNumber(roster.length) })}
      refreshing={false}
      onRefresh={refresh}
      actions={isAdmin ? <Button label={t('add')} onPress={() => setAdding(true)} /> : undefined}>
      {members.isPending ? <ActivityIndicator color={color.inkMuted} /> : null}
      <ErrorText error={members.error ?? stats.error ?? h2h.error} />
      {roster.length > 0 ? (
        <Card style={styles.card}>
          {roster.map((p, i) => (
            <View key={p.userId}>
              {i > 0 ? <View style={styles.rule} /> : null}
              <LeaderRow player={p} rank={p.games > 0 ? i + 1 : null} h2h={h2h.data ?? []} nameOf={members.nameOf} />
            </View>
          ))}
        </Card>
      ) : null}
      {isAdmin ? <AddPlayerSheet clubId={current.club.id} visible={adding} onClose={() => setAdding(false)} /> : null}
    </Screen>
  )
}

interface LeaderRowProps {
  player: RosterRow<Member>
  /** Place on the board; null for players without a counted game. */
  rank: number | null
  h2h: readonly H2HRow[]
  nameOf: (userId: string | null) => string
}

function LeaderRow({ player: p, rank, h2h, nameOf }: LeaderRowProps) {
  const { t } = useTranslation('players')
  const me = useUserId()
  const victim = mostBeaten(h2h, p.userId)
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/player/[id]', params: { id: p.userId } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text variant="scoreSm" tone={rank === 1 ? color.accent : color.inkFaint} style={styles.rank}>
        {rank === null ? '–' : formatNumber(rank)}
      </Text>
      <Avatar name={p.name} url={p.avatarUrl} size={40} />
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {p.userId === me ? t('you', { name: p.name }) : p.name}
        </Text>
        {p.games === 0 ? (
          <Text variant="caption" tone={color.inkFaint}>
            {t('noGames')}
          </Text>
        ) : (
          <View style={styles.record}>
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
        )}
        {victim ? (
          <Text variant="caption" tone={color.inkMuted} numberOfLines={1}>
            {t('beatsMost', { name: nameOf(victim.opponentId), n: formatNumber(victim.wins) })}
          </Text>
        ) : null}
      </View>
      {p.role === 'member' ? null : <RoleChip role={p.role} />}
      <Chevron />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { gap: 0, paddingVertical: space.xs, paddingHorizontal: space.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginStart: 28 + space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 64 },
  pressed: { opacity: 0.6 },
  rank: { width: 28, textAlign: 'center' },
  body: { flex: 1, gap: space.xxs },
  record: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
})
