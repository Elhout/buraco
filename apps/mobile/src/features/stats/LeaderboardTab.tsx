import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, EmptyState, Row, SectionTitle, Text } from '@/components/ui'
import { ErrorBlock, LoadingBlock } from '@/features/history/ui'
import { formatDate, formatNumber, formatPercent, formatSigned } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import { useLeaderboard } from './api'
import { LEADERBOARD_MIN_GAMES, type RankedStanding, type Standing, rankLeaderboard } from './select'
import type { TabProps } from './MeTab'
import { BigNumber, RateBar } from './viz'

const COL = { rank: 32, num: 52 } as const

function HeaderRow() {
  const { t } = useTranslation(['stats', 'common'])
  return (
    <Row gap={space.sm} style={styles.header}>
      <Text variant="caption" tone={color.inkFaint} style={{ width: COL.rank }}>
        {t('leaderboard.rank')}
      </Text>
      <Text variant="caption" tone={color.inkFaint} style={styles.flex}>
        {t('leaderboard.player')}
      </Text>
      <Text variant="caption" tone={color.inkFaint} style={styles.num} center>
        {t('leaderboard.games')}
      </Text>
      <Text variant="caption" tone={color.inkFaint} style={styles.num} center>
        {t('leaderboard.winPct')}
      </Text>
      <Text variant="caption" tone={color.inkFaint} style={styles.num} center>
        {t('leaderboard.diff')}
      </Text>
    </Row>
  )
}

function StandingRow({ s, name, isMe }: { s: RankedStanding; name: string; isMe: boolean }) {
  const { t } = useTranslation(['stats', 'common'])
  const podium = s.rank === 1 ? color.teamA : color.ink
  const label = t('a11y.standing', {
    rank: formatNumber(s.rank),
    name,
    games: formatNumber(s.games),
    rate: formatNumber(Math.round(s.winRate * 100)),
    diff: formatSigned(s.pointDiff),
  })
  return (
    <View style={[styles.row, isMe && styles.me]} accessible accessibilityLabel={label}>
      <Row gap={space.sm}>
        <View style={{ width: COL.rank }}>
          <BigNumber text={formatNumber(s.rank)} size="scoreSm" tone={podium} />
        </View>
        <Avatar name={name} size={28} />
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {name}
        </Text>
        <Text variant="label" tone={color.inkMuted} style={styles.num} center>
          {formatNumber(s.games)}
        </Text>
        <Text variant="bodyStrong" style={styles.num} center>
          {formatPercent(s.winRate)}
        </Text>
        <Text variant="label" tone={s.pointDiff >= 0 ? color.success : color.danger} style={styles.num} center>
          {formatSigned(s.pointDiff)}
        </Text>
      </Row>
      <View style={styles.bar}>
        <RateBar rate={s.winRate} tone={podium} height={4} />
      </View>
    </View>
  )
}

function UnrankedRow({ s, name }: { s: Standing; name: string }) {
  const { t } = useTranslation(['stats', 'common'])
  const progress = t('leaderboard.unrankedGames', { count: s.games, n: formatNumber(s.games), min: formatNumber(LEADERBOARD_MIN_GAMES) })
  return (
    <View style={styles.row} accessible accessibilityLabel={`${name}, ${progress}`}>
      <Row gap={space.sm}>
        <Avatar name={name} size={28} />
        <Text variant="body" numberOfLines={1} style={styles.flex}>
          {name}
        </Text>
        <Text variant="caption" tone={color.inkMuted}>
          {progress}
        </Text>
      </Row>
      <RateBar rate={s.games / LEADERBOARD_MIN_GAMES} tone={color.inkFaint} height={4} />
    </View>
  )
}

/** Club leaderboard: ranked by win rate (min. 10 games) for the current season. */
export function LeaderboardTab({ clubId, me, nameOf, seasonStart }: TabProps & { seasonStart: string | null }) {
  const { t, i18n } = useTranslation(['stats', 'common'])
  const query = useLeaderboard(clubId)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />

  const { ranked, unranked } = rankLeaderboard(query.data)
  const name = (id: string): string => nameOf(id) || '—'
  const min = formatNumber(LEADERBOARD_MIN_GAMES)
  return (
    <>
      <Text variant="label" tone={color.inkMuted}>
        {seasonStart ? t('leaderboard.since', { date: formatDate(`${seasonStart}T00:00:00`, i18n.language) }) : t('leaderboard.allTime')}
      </Text>
      <Card>
        {ranked.length === 0 ? (
          <EmptyState icon="podium-outline" title={t('leaderboard.emptyTitle')} body={t('leaderboard.emptyBody', { min })} />
        ) : (
          <>
            <HeaderRow />
            {ranked.map((s) => (
              <StandingRow key={s.userId} s={s} name={name(s.userId)} isMe={s.userId === me} />
            ))}
          </>
        )}
      </Card>
      {unranked.length > 0 ? (
        <>
          <SectionTitle>{t('leaderboard.unrankedTitle', { min })}</SectionTitle>
          <Card tone="sunken">
            {unranked.map((s) => (
              <UnrankedRow key={s.userId} s={s} name={name(s.userId)} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: space.xs },
  num: { width: COL.num, fontVariant: ['tabular-nums'] },
  row: { gap: space.xs, paddingVertical: space.xs, paddingHorizontal: space.xs, borderRadius: radius.sm },
  me: { backgroundColor: color.raised },
  bar: { paddingStart: COL.rank + space.sm },
})
