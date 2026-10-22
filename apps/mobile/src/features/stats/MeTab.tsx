import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, EmptyState, Row, Text } from '@/components/ui'
import { ErrorBlock, LoadingBlock } from '@/features/history/ui'
import { formatNumber, formatPercent, formatSigned } from '@/lib/format'
import { color, space } from '@/theme/tokens'
import { useMyH2H, useMyStats, usePairStats } from './api'
import { type MyStats, type Opponent, type Partner, bestPartner, toMyStats, toPairs, toughestOpponents } from './select'
import { BigNumber, RateBar, SplitBar, StatTile, TileGrid } from './viz'

export interface TabProps {
  clubId: string
  me: string
  nameOf: (userId: string | null) => string
}

const pct = (rate: number): string => formatNumber(Math.round(rate * 100))

function Hero({ s }: { s: MyStats }) {
  const { t } = useTranslation(['stats', 'common'])
  const record =
    s.draws > 0
      ? t('me.recordDraws', { wins: formatNumber(s.wins), losses: formatNumber(s.losses), draws: formatNumber(s.draws) })
      : t('me.record', { wins: formatNumber(s.wins), losses: formatNumber(s.losses) })
  return (
    <Card accent={color.accent}>
      <View
        accessible
        accessibilityLabel={`${t('a11y.winRate', { value: pct(s.winRate) })}. ${record}. ${t('games', { count: s.games, n: formatNumber(s.games) })}`}>
        <Text variant="caption" tone={color.inkMuted}>
          {t('me.winRate')}
        </Text>
        <BigNumber text={formatPercent(s.winRate)} size="scoreXl" tone={color.ink} />
        <Row gap={space.sm}>
          <Text variant="bodyStrong" style={styles.flex}>
            {record}
          </Text>
          <Text variant="label" tone={color.inkMuted}>
            {t('games', { count: s.games, n: formatNumber(s.games) })}
          </Text>
        </Row>
      </View>
      <SplitBar
        segments={[
          { value: s.wins, tone: color.success },
          { value: s.draws, tone: color.inkFaint },
          { value: s.losses, tone: color.danger },
        ]}
      />
    </Card>
  )
}

function Tiles({ s }: { s: MyStats }) {
  const { t } = useTranslation(['stats', 'common'])
  return (
    <TileGrid>
      <StatTile label={t('me.avgPerGame')} value={formatNumber(s.avgPerGame)} />
      <StatTile label={t('me.avgPerRound')} value={formatNumber(s.avgPerRound)} />
      <StatTile
        label={t('me.biggestWin')}
        value={s.biggestWinMargin === null ? '—' : formatSigned(s.biggestWinMargin)}
        tone={color.success}
      />
      <StatTile
        label={t('me.longestGame')}
        value={formatNumber(s.longestGame)}
        sub={t('me.rounds', { count: s.longestGame, n: formatNumber(s.longestGame) })}
      />
      <StatTile label={t('me.cuts')} value={formatNumber(s.cuts)} sub={t('me.cutsPerGame', { rate: formatNumber(s.cutsPerGame) })} />
      <StatTile
        label={t('me.currentStreak')}
        value={formatNumber(s.currentStreak)}
        sub={t('me.wins', { count: s.currentStreak, n: formatNumber(s.currentStreak) })}
        tone={color.accent}
      />
      <StatTile
        label={t('me.bestStreak')}
        value={formatNumber(s.bestStreak)}
        sub={t('me.wins', { count: s.bestStreak, n: formatNumber(s.bestStreak) })}
      />
    </TileGrid>
  )
}

function PersonRow({ name, line, rate, tone, label }: { name: string; line: string; rate: number; tone: string; label: string }) {
  return (
    <View style={styles.person} accessible accessibilityLabel={label}>
      <Row gap={space.md}>
        <Avatar name={name} size={36} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone={color.inkMuted}>
            {line}
          </Text>
        </View>
        <BigNumber text={formatPercent(rate)} size="scoreSm" tone={tone} />
      </Row>
      <RateBar rate={rate} tone={tone} />
    </View>
  )
}

function Partners({ partner, opponents, nameOf }: { partner: Partner | null; opponents: readonly Opponent[]; nameOf: TabProps['nameOf'] }) {
  const { t } = useTranslation(['stats', 'common'])
  const name = (id: string): string => nameOf(id) || '—'
  return (
    <>
      <Card>
        <Text variant="label" tone={color.inkMuted}>
          {t('me.bestPartner')}
        </Text>
        {partner ? (
          <PersonRow
            name={name(partner.partnerId)}
            line={t('me.partnerLine', {
              rate: formatPercent(partner.winRate),
              games: t('games', { count: partner.games, n: formatNumber(partner.games) }),
            })}
            rate={partner.winRate}
            tone={color.success}
            label={`${name(partner.partnerId)}, ${t('a11y.winRate', { value: pct(partner.winRate) })}, ${t('games', { count: partner.games, n: formatNumber(partner.games) })}`}
          />
        ) : (
          <Text tone={color.inkMuted}>{t('me.bestPartnerNone')}</Text>
        )}
      </Card>
      <Card>
        <Text variant="label" tone={color.inkMuted}>
          {t('me.toughest')}
        </Text>
        {opponents.length === 0 ? <Text tone={color.inkMuted}>{t('me.toughestNone')}</Text> : null}
        {opponents.map((o) => {
          const line = t('me.opponentLine', { wins: formatNumber(o.wins), losses: formatNumber(o.losses), diff: formatSigned(o.pointDiff) })
          return (
            <PersonRow
              key={o.opponentId}
              name={name(o.opponentId)}
              line={line}
              rate={o.winRate}
              tone={color.danger}
              label={`${name(o.opponentId)}, ${t('a11y.winRate', { value: pct(o.winRate) })}, ${line}`}
            />
          )
        })}
      </Card>
    </>
  )
}

/** My verified-game stats in the current club. */
export function MeTab({ clubId, me, nameOf }: TabProps) {
  const { t } = useTranslation(['stats', 'common'])
  const stats = useMyStats(clubId, me)
  const pairs = usePairStats(clubId)
  const h2h = useMyH2H(clubId, me)
  const failed = [stats, pairs, h2h].find((q) => q.isError)

  if (failed) return <ErrorBlock error={failed.error} onRetry={() => [stats, pairs, h2h].forEach((q) => void q.refetch())} />
  if (stats.isPending || pairs.isPending || h2h.isPending) return <LoadingBlock />
  const s = toMyStats(stats.data ?? null)
  if (!s) return <EmptyState icon="stats-chart-outline" title={t('me.emptyTitle')} body={t('me.emptyBody')} />

  return (
    <>
      <Hero s={s} />
      <Tiles s={s} />
      <Partners partner={bestPartner(toPairs(pairs.data ?? []), me)} opponents={toughestOpponents(h2h.data ?? [], me)} nameOf={nameOf} />
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  person: { gap: space.sm },
})
