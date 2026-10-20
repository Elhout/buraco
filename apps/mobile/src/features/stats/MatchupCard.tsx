import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Row, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, space, teamColor } from '@/theme/tokens'
import type { Matchup } from './h2h'
import { BigNumber, SplitBar } from './viz'

function Side({ name, wins, tone, align }: { name: string; wins: number; tone: string; align: 'start' | 'end' }) {
  const { t } = useTranslation(['stats', 'common'])
  const alignItems = align === 'start' ? 'flex-start' : 'flex-end'
  return (
    <View style={[styles.side, { alignItems }]}>
      <Text variant="label" tone={color.inkMuted} numberOfLines={2}>
        {name}
      </Text>
      <BigNumber text={formatNumber(wins)} size="score" tone={tone} />
      <Text variant="caption" tone={color.inkFaint}>
        {t('h2h.wins')}
      </Text>
    </View>
  )
}

export interface MatchupCardProps {
  matchup: Matchup
  firstName: string
  secondName: string
}

/** Head-to-head result: games, wins each side (team colours), draws and point differential. */
export function MatchupCard({ matchup: m, firstName, secondName }: MatchupCardProps) {
  const { t } = useTranslation(['stats', 'common'])
  if (m.games === 0) {
    return (
      <Card tone="sunken">
        <Text tone={color.inkMuted} center>
          {t('h2h.noGames')}
        </Text>
      </Card>
    )
  }
  const split = t('a11y.split', {
    first: firstName,
    winsFirst: formatNumber(m.winsFirst),
    second: secondName,
    winsSecond: formatNumber(m.winsSecond),
  })
  return (
    <Card>
      <Text variant="label" tone={color.inkMuted} center>
        {t('games', { count: m.games, n: formatNumber(m.games) })}
      </Text>
      <View accessible accessibilityLabel={split} style={styles.body}>
        <Row gap={space.md} style={styles.sides}>
          <Side name={firstName} wins={m.winsFirst} tone={teamColor('A')} align="start" />
          <Text variant="label" tone={color.inkFaint}>
            {t('common:vs')}
          </Text>
          <Side name={secondName} wins={m.winsSecond} tone={teamColor('B')} align="end" />
        </Row>
        <SplitBar
          segments={[
            { value: m.winsFirst, tone: teamColor('A') },
            { value: m.draws, tone: color.inkFaint },
            { value: m.winsSecond, tone: teamColor('B') },
          ]}
        />
      </View>
      {m.draws > 0 ? (
        <Text variant="caption" tone={color.inkMuted} center>
          {t('h2h.draws', { count: m.draws, n: formatNumber(m.draws) })}
        </Text>
      ) : null}
      <Row gap={space.sm} style={styles.diff}>
        <Text variant="label" tone={color.inkMuted} style={styles.flex}>
          {`${t('h2h.pointDiff')} · ${t('h2h.pointDiffFor', { name: firstName })}`}
        </Text>
        <BigNumber text={formatSigned(m.pointDiff)} size="scoreSm" tone={m.pointDiff >= 0 ? color.success : color.danger} />
      </Row>
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: space.md },
  sides: { alignItems: 'flex-start' },
  side: { flex: 1, gap: space.xxs },
  diff: { paddingTop: space.xs },
})
