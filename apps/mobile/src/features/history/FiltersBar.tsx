import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { Avatar } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { space } from '@/theme/tokens'
import { DATE_RANGES, type DateRange, type HistoryFilters, activeFilterCount } from './filters'
import { Chip, OptionSheet, type SheetOption } from './ui'

const ANY = '__any__'

export interface FiltersBarProps {
  filters: HistoryFilters
  onChange: (next: HistoryFilters) => void
  members: readonly Member[]
  seasonStart: string | null
  clear: () => void
}

export function memberOptions(members: readonly Member[], size = 32): SheetOption<string>[] {
  return members.map((m) => ({ value: m.userId, label: m.name, leading: <Avatar name={m.name} url={m.avatarUrl} size={size} /> }))
}

/** Filter chips: my games, player, date range, verified only, tournament only. */
export function FiltersBar({ filters, onChange, members, seasonStart, clear }: FiltersBarProps) {
  const { t } = useTranslation(['history', 'common'])
  const [sheet, setSheet] = useState<'player' | 'range' | null>(null)
  const player = filters.player ? members.find((m) => m.userId === filters.player) : undefined
  const ranges = DATE_RANGES.filter((r) => r !== 'season' || seasonStart !== null)
  const set = (patch: Partial<HistoryFilters>): void => onChange({ ...filters, ...patch })

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel={t('filters.label')}>
        <Chip label={t('filters.mine')} selected={filters.mine} onPress={() => set({ mine: !filters.mine })} />
        <Chip
          label={player ? t('filters.playerValue', { name: player.name }) : t('filters.player')}
          selected={filters.player !== null}
          picker
          onPress={() => setSheet('player')}
        />
        <Chip label={t(`filters.range.${filters.range}`)} selected={filters.range !== 'all'} picker onPress={() => setSheet('range')} />
        <Chip label={t('filters.verified')} selected={filters.verified} onPress={() => set({ verified: !filters.verified })} />
        <Chip label={t('filters.tournament')} selected={filters.tournament} onPress={() => set({ tournament: !filters.tournament })} />
        {activeFilterCount(filters) > 0 ? <Chip label={t('filters.clear')} selected={false} onPress={clear} /> : null}
      </ScrollView>
      <OptionSheet<string>
        visible={sheet === 'player'}
        title={t('filters.playerTitle')}
        options={[{ value: ANY, label: t('filters.anyPlayer') }, ...memberOptions(members)]}
        selected={filters.player ?? ANY}
        onSelect={(v) => set({ player: v === ANY ? null : v })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<DateRange>
        visible={sheet === 'range'}
        title={t('filters.rangeTitle')}
        options={ranges.map((r) => ({ value: r, label: t(`filters.range.${r}`) }))}
        selected={filters.range}
        onSelect={(range) => set({ range })}
        onClose={() => setSheet(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs },
})
