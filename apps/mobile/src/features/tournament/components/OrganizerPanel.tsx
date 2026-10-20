import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, Card, SectionTitle, Stack, Text } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { color } from '@/theme/tokens'
import type { useTournamentActions } from '../actions'
import { nextDraw } from '../draw'
import { liveRound } from '../model'
import type { TournamentData } from '../types'
import type { UnitIndex } from '../units'
import { CloseSheet, StartSheet } from './ConfirmSheets'
import { DrawSheet } from './DrawSheet'
import { SubstituteSheet } from './SubstituteSheet'

type Sheet = 'start' | 'draw' | 'substitute' | 'close' | null

export interface OrganizerPanelProps {
  data: TournamentData
  index: UnitIndex
  members: readonly Member[]
  actions: ReturnType<typeof useTournamentActions>
}

function NextRoundStatus({ data, index, onDraw }: { data: TournamentData; index: UnitIndex; onDraw: () => void }) {
  const { t } = useTranslation('tournament')
  const { tournament, rounds, matches } = data
  const draw = nextDraw({ format: tournament.format, pairing: tournament.pairing, index, matches, rounds, seed: 0 })
  const live = liveRound(rounds)
  if (draw.kind === 'waiting' && live) return <Text tone={color.inkMuted}>{t('organizer.roundLive', { n: live.round_no })}</Text>
  if (draw.kind === 'complete') {
    return (
      <Banner tone="success">
        {draw.champion ? t('detail.champion', { name: index.nameOf(draw.champion) }) : t('detail.allRoundsPlayed')}
      </Banner>
    )
  }
  if (draw.kind === 'invalid') return <Banner tone="warning">{t('organizer.invalid')}</Banner>
  if (draw.kind !== 'ready') return null
  return (
    <Button
      size="lg"
      block
      label={t('organizer.startRound', { n: draw.roundNo })}
      icon={<Ionicons name="play" size={18} color={color.onPrimary} />}
      onPress={onDraw}
    />
  )
}

/** Organizer-only controls. Hidden once the tournament is finished or cancelled. */
export function OrganizerPanel({ data, index, members, actions }: OrganizerPanelProps) {
  const { t } = useTranslation('tournament')
  const [sheet, setSheet] = useState<Sheet>(null)
  const { tournament, rounds, matches, entries } = data
  const close = () => {
    setSheet(null)
    for (const m of [actions.start, actions.startRound, actions.substitute, actions.close]) m.reset()
  }
  const done = close
  if (tournament.status === 'finished' || tournament.status === 'cancelled') return null

  return (
    <Card tone="sunken">
      <SectionTitle>{t('organizer.title')}</SectionTitle>
      {tournament.status === 'draft' ? (
        <Stack gap={8}>
          <Text tone={color.inkMuted}>{t('organizer.startHint')}</Text>
          <Button size="lg" block label={t('organizer.start')} onPress={() => setSheet('start')} />
        </Stack>
      ) : (
        <Stack gap={8}>
          <NextRoundStatus data={data} index={index} onDraw={() => setSheet('draw')} />
          <Button variant="secondary" block label={t('organizer.substitute')} onPress={() => setSheet('substitute')} />
        </Stack>
      )}
      <Button variant="quiet" block label={t('organizer.finish')} onPress={() => setSheet('close')} />

      <StartSheet
        visible={sheet === 'start'}
        onClose={close}
        busy={actions.start.isPending}
        error={actions.start.error}
        count={entries.length}
        onStart={() => actions.start.mutate(undefined, { onSuccess: done })}
      />
      {sheet === 'draw' ? (
        <DrawSheet
          visible
          onClose={close}
          tournamentId={tournament.id}
          roundMinutes={tournament.round_minutes}
          input={{ format: tournament.format, pairing: tournament.pairing, index, matches, rounds }}
          busy={actions.startRound.isPending}
          error={actions.startRound.error}
          onStart={(args) => actions.startRound.mutate(args, { onSuccess: done })}
        />
      ) : null}
      <SubstituteSheet
        visible={sheet === 'substitute'}
        onClose={close}
        entries={entries}
        members={members}
        busy={actions.substitute.isPending}
        error={actions.substitute.error}
        onSubstitute={(entryId, userId) => actions.substitute.mutate({ entryId, userId }, { onSuccess: done })}
      />
      <CloseSheet
        visible={sheet === 'close'}
        onClose={close}
        busy={actions.close.isPending}
        error={actions.close.error}
        roundLive={liveRound(rounds) !== null}
        onFinish={(cancel) => actions.close.mutate(cancel, { onSuccess: done })}
      />
    </Card>
  )
}
