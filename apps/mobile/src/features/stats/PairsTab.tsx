import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, EmptyState, Row, Segmented, Text } from '@/components/ui'
import { ErrorBlock, LoadingBlock } from '@/features/history/ui'
import { formatNumber, formatPercent } from '@/lib/format'
import { color, space } from '@/theme/tokens'
import { usePairStats } from './api'
import type { TabProps } from './MeTab'
import { type Pair, type PairSort, sortPairs, toPairs } from './select'
import { BigNumber, RateBar } from './viz'

function PairRow({ pair, names, mine }: { pair: Pair; names: readonly [string, string]; mine: boolean }) {
  const { t } = useTranslation(['stats', 'common'])
  const title = t('h2h.pairName', { a: names[0], b: names[1] })
  const games = t('games', { count: pair.games, n: formatNumber(pair.games) })
  const avg = t('pairs.avgScore', { score: formatNumber(pair.avgScore) })
  const label = t('a11y.pair', {
    names: title,
    games: formatNumber(pair.games),
    rate: formatNumber(Math.round(pair.winRate * 100)),
    avg: formatNumber(pair.avgScore),
  })
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Row gap={space.md}>
        <View style={styles.avatars}>
          <Avatar name={names[0]} size={30} ring={color.surface} />
          <View style={styles.overlap}>
            <Avatar name={names[1]} size={30} ring={color.surface} />
          </View>
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1} tone={mine ? color.teamA : color.ink}>
            {title}
          </Text>
          <Text variant="caption" tone={color.inkMuted}>
            {`${games} · ${avg}`}
          </Text>
        </View>
        <BigNumber text={formatPercent(pair.winRate)} size="scoreSm" />
      </Row>
      <RateBar rate={pair.winRate} tone={mine ? color.teamA : color.teamB} height={4} />
    </View>
  )
}

/** Every pair that has teamed up in a verified game: games, win rate, average score. */
export function PairsTab({ clubId, me, nameOf }: TabProps) {
  const { t } = useTranslation(['stats', 'common'])
  const [sort, setSort] = useState<PairSort>('winRate')
  const query = usePairStats(clubId)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />

  const pairs = sortPairs(toPairs(query.data), sort)
  if (pairs.length === 0) return <EmptyState icon="people-outline" title={t('pairs.emptyTitle')} body={t('pairs.emptyBody')} />
  const name = (id: string): string => nameOf(id) || '—'

  return (
    <>
      <View style={styles.sort} accessibilityLabel={t('pairs.sortBy')}>
        <Segmented<PairSort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'winRate', label: t('pairs.sortWinRate') },
            { value: 'games', label: t('pairs.sortGames') },
          ]}
        />
      </View>
      <Card>
        {pairs.map((p) => (
          <PairRow key={`${p.a}:${p.b}`} pair={p} names={[name(p.a), name(p.b)]} mine={p.a === me || p.b === me} />
        ))}
      </Card>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { gap: space.sm, paddingVertical: space.xs },
  avatars: { flexDirection: 'row', width: 50 },
  overlap: { marginStart: -12 },
  sort: { alignSelf: 'stretch' },
})
