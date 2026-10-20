import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { Row, Stack, Text } from '@/components/ui'
import { formatDate, formatNumber } from '@/lib/format'
import { color } from '@/theme/tokens'
import type { TournamentRow } from '../types'
import { StatusChip } from './StatusChip'

/** Name large, then status, format, partnership, target, date and organizer. */
export function TournamentHeader({ tournament, organizerName }: { tournament: TournamentRow; organizerName: string }) {
  const { t, i18n } = useTranslation('tournament')
  return (
    <Stack gap={8}>
      <Text variant="display" accessibilityRole="header">
        {tournament.name}
      </Text>
      <Row gap={8} style={styles.wrap}>
        <StatusChip status={tournament.status} />
        <Text variant="label" tone={color.inkMuted}>
          {t(`format.${tournament.format}`)} · {t(`pairing.${tournament.pairing}`)}
        </Text>
      </Row>
      <Text variant="caption" tone={color.inkMuted}>
        {t('target', { points: formatNumber(tournament.target_score) })} · {t('minutes', { count: tournament.round_minutes })} ·{' '}
        {formatDate(`${tournament.starts_on}T12:00:00`, i18n.language)}
        {organizerName ? ` · ${t('detail.organizer', { name: organizerName })}` : ''}
      </Text>
    </Stack>
  )
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
})
