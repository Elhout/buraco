import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Banner, Button, EmptyState, Row, SectionTitle, Stack, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import { shareCsv } from '../exportCsv'
import { type StandingRow, fileSlug, resultsCsv, standingsCsv } from '../standings'
import type { MatchView } from '../types'
import type { UnitIndex } from '../units'

export interface StandingsTabProps {
  rows: readonly StandingRow[]
  matches: readonly MatchView[]
  index: UnitIndex
  name: string
}

function Header() {
  const { t } = useTranslation('tournament')
  const cell = (label: string, style: object) => (
    <Text variant="caption" tone={color.inkMuted} style={style}>
      {label}
    </Text>
  )
  return (
    <View style={[styles.row, styles.head]}>
      {cell(t('standings.rank'), styles.rank)}
      {cell(t('standings.name'), styles.name)}
      {cell(t('standings.played'), styles.num)}
      {cell(t('standings.wdl'), styles.wdl)}
      {cell(t('standings.points'), styles.num)}
      {cell(t('standings.diff'), styles.diff)}
      {cell(t('standings.for'), styles.diff)}
    </View>
  )
}

function StandingLine({ row }: { row: StandingRow }) {
  const { t } = useTranslation('tournament')
  const wdl = [row.wins, row.draws, row.losses].map(formatNumber).join('-')
  return (
    <View
      style={[styles.row, row.isMe && styles.me]}
      accessible
      accessibilityLabel={t('standings.a11yRow', { rank: row.rank, name: row.name, points: row.matchPoints, diff: row.differential })}>
      <Text variant="bodyStrong" tone={row.rank === 1 ? color.teamA : color.ink} style={styles.rank}>
        {formatNumber(row.rank)}
      </Text>
      <Text variant={row.isMe ? 'bodyStrong' : 'body'} style={styles.name} numberOfLines={2}>
        {row.name}
      </Text>
      <Text variant="label" style={styles.num}>
        {formatNumber(row.played)}
      </Text>
      <Text variant="label" tone={color.inkMuted} style={styles.wdl}>
        {wdl}
      </Text>
      <Text variant="bodyStrong" style={styles.num}>
        {formatNumber(row.matchPoints)}
      </Text>
      <Text variant="label" tone={row.differential < 0 ? color.danger : color.ink} style={styles.diff}>
        {formatSigned(row.differential)}
      </Text>
      <Text variant="label" tone={color.inkMuted} style={styles.diff}>
        {formatNumber(row.pointsFor)}
      </Text>
    </View>
  )
}

/** Live leaderboard with the tiebreak order explained, plus CSV export for everyone. */
export function StandingsTab({ rows, matches, index, name }: StandingsTabProps) {
  const { t } = useTranslation('tournament')
  const [exportError, setExportError] = useState(false)
  const share = (kind: 'standings' | 'results') => {
    setExportError(false)
    const csv = kind === 'standings' ? standingsCsv(rows) : resultsCsv(matches, index)
    shareCsv(`${fileSlug(name)}-${kind}.csv`, csv).catch(() => setExportError(true))
  }

  if (rows.length === 0) return <EmptyState icon="podium-outline" title={t('standings.empty')} />
  return (
    <Stack gap={16}>
      <View style={styles.table}>
        <Header />
        {rows.map((r) => (
          <StandingLine key={r.unit} row={r} />
        ))}
      </View>
      <Text variant="caption" tone={color.inkMuted}>
        {t('standings.footnote')}
      </Text>
      <SectionTitle>{t('organizer.export')}</SectionTitle>
      <Row gap={8}>
        <Button variant="secondary" label={t('organizer.exportStandings')} onPress={() => share('standings')} />
        <Button variant="secondary" label={t('organizer.exportResults')} onPress={() => share('results')} />
      </Row>
      {exportError ? <Banner tone="danger">{t('organizer.exportFailed')}</Banner> : null}
    </Stack>
  )
}

const styles = StyleSheet.create({
  table: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, minHeight: 52 },
  head: { minHeight: 36, backgroundColor: color.sunken },
  me: { backgroundColor: color.raised, borderStartWidth: 4, borderStartColor: color.ivory },
  rank: { width: 28 },
  name: { flex: 1 },
  num: { width: 30, textAlign: 'center' },
  wdl: { width: 52, textAlign: 'center' },
  diff: { width: 48, textAlign: 'center' },
})
