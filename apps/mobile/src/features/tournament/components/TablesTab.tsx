import { Ionicons } from '@expo/vector-icons'
import { type Href, router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'
import { EmptyState, SectionTitle, Stack, Text } from '@/components/ui'
import { HIT, color, radius, space } from '@/theme/tokens'
import { type RoundGroup, isSeated, matchHref } from '../model'
import type { MatchView } from '../types'
import type { UnitIndex } from '../units'
import { MatchCard } from './MatchCard'

export interface TablesTabProps {
  groups: readonly RoundGroup[]
  index: UnitIndex
  myEntryIds: ReadonlySet<string>
  isDraft: boolean
  onEdit: ((match: MatchView) => void) | null
}

function RoundTables({ group, index, myEntryIds, onEdit }: { group: RoundGroup } & Omit<TablesTabProps, 'groups' | 'isDraft'>) {
  const { t } = useTranslation('tournament')
  const byes = group.round.byes.map(index.nameOf).filter((n) => n !== '')
  return (
    <Stack gap={12}>
      {group.matches.map((m) => {
        const href = matchHref(m, myEntryIds)
        return (
          <MatchCard
            key={m.matchId}
            match={m}
            index={index}
            mine={isSeated(m, myEntryIds)}
            onOpen={href ? () => router.push(href as Href) : null}
            onEdit={onEdit ? () => onEdit(m) : null}
          />
        )
      })}
      {byes.length > 0 ? (
        <Text variant="label" tone={color.inkMuted}>
          {t('detail.byes', { names: byes.join(', ') })}
        </Text>
      ) : null}
    </Stack>
  )
}

/** Current round's tables first; earlier rounds collapse under their own headers. */
export function TablesTab({ groups, index, myEntryIds, isDraft, onEdit }: TablesTabProps) {
  const { t } = useTranslation('tournament')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [current, ...previous] = groups

  if (!current) {
    return <EmptyState icon="grid-outline" title={t('detail.noRounds')} body={isDraft ? t('detail.draftBody') : t('detail.noRoundsBody')} />
  }
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Stack gap={16}>
      <Text variant="title">{t('detail.roundOf', { n: current.round.round_no })}</Text>
      <RoundTables group={current} index={index} myEntryIds={myEntryIds} onEdit={onEdit} />
      {previous.length > 0 ? <SectionTitle>{t('detail.previousRounds')}</SectionTitle> : null}
      {previous.map((g) => {
        const expanded = open.has(g.round.id)
        return (
          <Stack key={g.round.id} gap={12}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={t(expanded ? 'detail.hideRound' : 'detail.showRound', { n: g.round.round_no })}
              onPress={() => toggle(g.round.id)}
              style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
              <Text variant="bodyStrong" style={styles.flex}>
                {t('detail.roundOf', { n: g.round.round_no })}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={color.inkMuted} />
            </Pressable>
            {expanded ? <RoundTables group={g} index={index} myEntryIds={myEntryIds} onEdit={onEdit} /> : null}
          </Stack>
        )
      })}
    </Stack>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
  },
  pressed: { opacity: 0.8 },
})
