import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Chevron, Row, Text } from '@/components/ui'
import { formatDate, formatNumber } from '@/lib/format'
import { color } from '@/theme/tokens'
import type { TournamentRow } from '../types'
import { StatusChip } from './StatusChip'

/** One tournament in the list: name dominant, then date, format and partnership. */
export function TournamentCard({ tournament, onPress }: { tournament: TournamentRow; onPress: () => void }) {
  const { t, i18n } = useTranslation('tournament')
  const date = formatDate(`${tournament.starts_on}T12:00:00`, i18n.language)
  const live = tournament.status === 'running'
  return (
    <Card
      onPress={onPress}
      accent={live ? color.success : undefined}
      accessibilityLabel={t('list.a11yCard', { name: tournament.name, status: t(`status.${tournament.status}`), date })}>
      <Row gap={12}>
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={2}>
            {tournament.name}
          </Text>
          <Text variant="label" tone={color.inkMuted}>
            {date}
          </Text>
        </View>
        <Chevron />
      </Row>
      <Row gap={8} style={styles.wrap}>
        <StatusChip status={tournament.status} />
        <Text variant="caption" tone={color.inkMuted}>
          {t(`format.${tournament.format}`)} · {t(`pairing.${tournament.pairing}`)} ·{' '}
          {t('target', { points: formatNumber(tournament.target_score) })}
        </Text>
      </Row>
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
})
