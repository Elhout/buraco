import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Banner, Button, ErrorText, Row, Sheet, Stack, TeamBadge, Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'
import { type DrawInput, type StartRoundArgs, newSeed, nextDraw, toStartRoundArgs } from '../draw'

export interface DrawSheetProps {
  visible: boolean
  onClose: () => void
  tournamentId: string
  roundMinutes: number
  input: Omit<DrawInput, 'seed'>
  busy: boolean
  error: unknown
  onStart: (args: StartRoundArgs) => void
}

/** Preview of the next round's tables, with reshuffle where the draw is random, then start_round. */
export function DrawSheet({ visible, onClose, tournamentId, roundMinutes, input, busy, error, onStart }: DrawSheetProps) {
  const { t } = useTranslation(['tournament', 'common'])
  const [seed, setSeed] = useState(newSeed)
  const draw = nextDraw({ ...input, seed })
  if (draw.kind !== 'ready') {
    return (
      <Sheet visible={visible} onClose={onClose} title={t('organizer.invalid')}>
        <Button variant="secondary" label={t('common:actions.close')} onPress={onClose} />
      </Sheet>
    )
  }
  const { index } = input
  const byes = draw.plan.byes.map(index.nameOf)
  return (
    <Sheet visible={visible} onClose={onClose} locked={busy} title={t('draw.title', { n: draw.roundNo })} subtitle={t('draw.subtitle')}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {draw.plan.matches.map((m, i) => (
          <View key={`${m.teamA.join()}-${m.teamB.join()}`} style={styles.table}>
            <Text variant="label" tone={color.inkMuted}>
              {t('detail.table', { n: i + 1 })}
            </Text>
            <Row gap={8}>
              <TeamBadge team="A" size="sm" />
              <Text variant="bodyStrong" style={styles.flex}>
                {m.teamA.map(index.nameOf).join(' & ')}
              </Text>
            </Row>
            <Row gap={8}>
              <TeamBadge team="B" size="sm" />
              <Text variant="bodyStrong" style={styles.flex}>
                {m.teamB.map(index.nameOf).join(' & ')}
              </Text>
            </Row>
          </View>
        ))}
        {byes.length > 0 ? <Banner tone="info">{t('detail.byes', { names: byes.join(', ') })}</Banner> : null}
      </ScrollView>
      <Text variant="caption" tone={color.inkMuted} center>
        {t('draw.clockNote', { count: roundMinutes })}
      </Text>
      <ErrorText error={error} />
      <Stack gap={8}>
        <Button
          size="lg"
          block
          loading={busy}
          label={t('draw.start', { n: draw.roundNo })}
          onPress={() => onStart(toStartRoundArgs(tournamentId, draw.plan, index))}
        />
        {draw.random ? (
          <Button
            variant="secondary"
            block
            disabled={busy}
            label={t('draw.reshuffle')}
            icon={<Ionicons name="shuffle" size={18} color={color.ink} />}
            onPress={() => setSeed(newSeed())}
          />
        ) : null}
      </Stack>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { maxHeight: 360 },
  listContent: { gap: space.sm },
  table: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.raised },
})
