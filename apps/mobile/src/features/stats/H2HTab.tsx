import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Chevron, Segmented, Text } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { memberOptions } from '@/features/history/FiltersBar'
import { ErrorBlock, LoadingBlock, OptionSheet } from '@/features/history/ui'
import { HIT, color, radius, space } from '@/theme/tokens'
import { usePairH2H, usePlayerH2H } from './api'
import { type PairIds, normalizePair, pairMatchup, pairsOverlap, playerMatchup } from './h2h'
import { MatchupCard } from './MatchupCard'
import type { TabProps } from './MeTab'

type Mode = 'players' | 'pairs'
type Slots = readonly (string | null)[]

function Slot({ label, name, onPress }: { label: string; name: string | null; onPress: () => void }) {
  const { t } = useTranslation(['stats', 'common'])
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name ?? t('h2h.choose')}`}
      style={({ pressed }) => [styles.slot, pressed && { backgroundColor: color.raised }]}>
      {name ? <Avatar name={name} size={28} /> : null}
      <View style={styles.flex}>
        <Text variant="caption" tone={color.inkFaint}>
          {label}
        </Text>
        <Text variant="bodyStrong" tone={name ? color.ink : color.inkMuted} numberOfLines={1}>
          {name ?? t('h2h.choose')}
        </Text>
      </View>
      <Chevron />
    </Pressable>
  )
}

const pairOf = (a: string | null, b: string | null): PairIds | null => (a && b ? normalizePair(a, b) : null)

function PlayersResult({ clubId, slots, names }: { clubId: string; slots: Slots; names: (id: string | null) => string }) {
  const { t } = useTranslation(['stats', 'common'])
  const [x = null, y = null] = slots
  const query = usePlayerH2H(clubId, x, y)
  if (!x || !y) return <Text tone={color.inkMuted}>{t('h2h.promptPlayers')}</Text>
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
  return <MatchupCard matchup={playerMatchup(query.data)} firstName={names(x)} secondName={names(y)} />
}

function PairsResult({ clubId, slots, names }: { clubId: string; slots: Slots; names: (id: string | null) => string }) {
  const { t } = useTranslation(['stats', 'common'])
  const first = pairOf(slots[0] ?? null, slots[1] ?? null)
  const second = pairOf(slots[2] ?? null, slots[3] ?? null)
  const valid = first !== null && second !== null && !pairsOverlap(first, second)
  const query = usePairH2H(clubId, valid ? first : null, valid ? second : null)
  if (!valid) return <Text tone={color.inkMuted}>{t('h2h.promptPairs')}</Text>
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
  const label = (p: PairIds): string => t('h2h.pairName', { a: names(p[0]), b: names(p[1]) })
  return <MatchupCard matchup={pairMatchup(query.data, first, second)} firstName={label(first)} secondName={label(second)} />
}

/** Head-to-head picker: two players (v_h2h) or two fixed pairs (v_pair_h2h). */
export function H2HTab({ clubId, me, nameOf, members }: TabProps & { members: readonly Member[] }) {
  const { t } = useTranslation(['stats', 'common'])
  const [mode, setMode] = useState<Mode>('players')
  const [players, setPlayers] = useState<Slots>([me, null])
  const [pairs, setPairs] = useState<Slots>([me, null, null, null])
  const [picking, setPicking] = useState<number | null>(null)
  const slots = mode === 'players' ? players : pairs
  const setSlots = mode === 'players' ? setPlayers : setPairs
  const names = (id: string | null): string => nameOf(id) || '—'
  const slotName = (i: number): string | null => (slots[i] ? names(slots[i] ?? null) : null)
  const taken = new Set(slots.filter((s, i): s is string => s !== null && i !== picking))
  const labels =
    mode === 'players' ? [t('h2h.player1'), t('h2h.player2')] : [t('h2h.pair1'), t('h2h.pair1'), t('h2h.pair2'), t('h2h.pair2')]

  return (
    <>
      <Segmented<Mode>
        value={mode}
        onChange={(m) => {
          setMode(m)
          setPicking(null)
        }}
        options={[
          { value: 'players', label: t('h2h.players') },
          { value: 'pairs', label: t('h2h.pairs') },
        ]}
      />
      <View style={styles.slots}>
        {slots.map((_, i) => (
          <View key={i} style={mode === 'pairs' ? styles.half : styles.full}>
            <Slot label={labels[i] ?? ''} name={slotName(i)} onPress={() => setPicking(i)} />
          </View>
        ))}
      </View>
      {mode === 'players' ? (
        <PlayersResult clubId={clubId} slots={players} names={names} />
      ) : (
        <PairsResult clubId={clubId} slots={pairs} names={names} />
      )}
      <OptionSheet<string>
        visible={picking !== null}
        title={t('h2h.pickTitle')}
        options={memberOptions(members.filter((m) => !taken.has(m.userId)))}
        selected={picking !== null ? (slots[picking] ?? null) : null}
        onSelect={(id) => setSlots(slots.map((s, i) => (i === picking ? id : s)))}
        onClose={() => setPicking(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  full: { flexBasis: '100%' },
  half: { flexGrow: 1, flexBasis: '45%' },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT + space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
})
