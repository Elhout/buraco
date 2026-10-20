import { Ionicons } from '@expo/vector-icons'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EmptyState, Stack, Text } from '@/components/ui'
import { formatDateTime, formatNumber } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import type { LogDetail, LogItem, ResultSnapshot } from '../events'

type T = TFunction<['tournament', 'common']>

const ICON: Record<LogDetail['type'], keyof typeof Ionicons.glyphMap> = {
  created: 'add-circle-outline',
  entries_set: 'people-outline',
  started: 'play-circle-outline',
  round_started: 'grid-outline',
  substituted: 'swap-horizontal',
  result_edited: 'create-outline',
  finished: 'trophy-outline',
  cancelled: 'close-circle-outline',
  other: 'ellipse-outline',
}

function snapshotText(s: ResultSnapshot, t: T): string {
  if (s.result === null) return t('log.noResultShort')
  const points = s.a !== null && s.b !== null ? ` ${formatNumber(s.a)}–${formatNumber(s.b)}` : ''
  return `${t(`detail.result.${s.result}`)}${points}`
}

function title(d: LogDetail, t: T): string {
  switch (d.type) {
    case 'entries_set':
      return t('log.entries_set', { count: d.count })
    case 'round_started':
      return t('log.round_started', { round: d.roundNo, count: d.tables })
    case 'substituted':
      return t('log.substituted', { from: d.from || t('common:guest'), to: d.to || t('common:guest') })
    case 'result_edited':
      return d.roundNo === null ? t('log.result_edited_unknown') : t('log.result_edited', { round: d.roundNo, table: d.tableNo })
    case 'other':
      return t('log.other', { type: d.raw })
    default:
      return t(`log.${d.type}`)
  }
}

function LogEntry({ item }: { item: LogItem }) {
  const { t, i18n } = useTranslation(['tournament', 'common'])
  const d = item.detail
  return (
    <View style={styles.item}>
      <Ionicons name={ICON[d.type]} size={22} color={d.type === 'result_edited' ? color.warning : color.inkMuted} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title(d, t)}</Text>
        {d.type === 'result_edited' ? (
          <>
            <Text variant="label">{t('log.resultChange', { from: snapshotText(d.from, t), to: snapshotText(d.to, t) })}</Text>
            <Text variant="label" tone={color.inkMuted}>
              {t('log.reason', { reason: d.reason })}
            </Text>
          </>
        ) : null}
        <Text variant="caption" tone={color.inkFaint}>
          {item.actor
            ? t('log.by', { actor: item.actor, time: formatDateTime(item.at, i18n.language) })
            : formatDateTime(item.at, i18n.language)}
        </Text>
      </View>
    </View>
  )
}

/** Audit log: who did what, including every result edit with its reason. */
export function LogTab({ items }: { items: readonly LogItem[] }) {
  const { t } = useTranslation('tournament')
  if (items.length === 0) return <EmptyState icon="document-text-outline" title={t('log.empty')} />
  return (
    <Stack gap={8}>
      {items.map((item) => (
        <LogEntry key={item.id} item={item} />
      ))}
    </Stack>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xxs },
  item: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface },
})
