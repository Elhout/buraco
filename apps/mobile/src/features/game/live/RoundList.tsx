import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EmptyState, SectionTitle, Text } from '@/components/ui'
import { formatTime } from '@/lib/format'
import { color, space } from '@/theme/tokens'
import { RoundRow } from './RoundRow'
import type { RoundRowModel } from './roundRows'

interface RoundListProps {
  readonly rows: readonly RoundRowModel[]
  readonly isGhost: boolean
  /** Query timestamp (ms) of the last refetch; 0 when never fetched. */
  readonly updatedAt: number
}

/** Rounds, newest first, with the last-updated time so a stale phone is obvious. */
export function RoundList({ rows, isGhost, updatedAt }: RoundListProps) {
  const { t, i18n } = useTranslation(['game', 'common'])
  const updated =
    updatedAt > 0 ? (
      <Text variant="caption" tone={color.inkFaint}>
        {t('common:connection.lastUpdated', { time: formatTime(new Date(updatedAt).toISOString(), i18n.language) })}
      </Text>
    ) : undefined
  return (
    <View style={styles.list}>
      <SectionTitle action={updated}>{t('rounds.title')}</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState icon="layers-outline" title={t('rounds.empty')} body={t('rounds.emptyBody')} />
      ) : (
        rows.map((row) => <RoundRow key={row.key} row={row} isGhost={isGhost} />)
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
})
