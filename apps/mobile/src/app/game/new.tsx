import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, ErrorText, Screen, Text } from '@/components/ui'
import { useSession, useUserId } from '@/features/auth/SessionProvider'
import { useState } from 'react'
import { goBackOr } from '@/features/auth/screens/BackButton'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { AddPlayerSheet } from '@/features/clubs/screens/AddPlayerSheet'
import { type DraftIssue, type SeatNo, filledCount } from '@/features/game/new/draft'
import { MemberPicker } from '@/features/game/new/MemberPicker'
import { SeatPickerSheet } from '@/features/game/new/SeatPickerSheet'
import { TeamPanels } from '@/features/game/new/TeamPanels'
import { type NewGameState, useNewGame } from '@/features/game/new/useNewGame'
import { useLobby } from '@/features/lobby/api'
import { busyPlayerIds } from '@/features/lobby/model'
import { useOnlineMembers } from '@/features/lobby/presence'
import { HIT, color, radius, space } from '@/theme/tokens'

function CloseButton() {
  const { t } = useTranslation(['lobby', 'common'])
  return (
    <Pressable
      onPress={() => goBackOr('/club')}
      accessibilityRole="button"
      accessibilityLabel={t('new.close')}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Ionicons name="close" size={24} color={color.ink} />
    </Pressable>
  )
}

/** The first problem worth telling the user about; "pick N more" is handled by the button hint. */
const firstIssue = (issues: readonly DraftIssue[]): Exclude<DraftIssue, 'needFour'> | null =>
  (issues.find((i) => i !== 'needFour') as Exclude<DraftIssue, 'needFour'> | undefined) ?? null

function StartBar({ state }: { state: NewGameState }) {
  const { t } = useTranslation(['lobby', 'common'])
  const missing = 4 - filledCount(state.slots)
  const issue = firstIssue(state.issues)
  const hint = issue ? t(`new.issue.${issue}`) : missing > 0 ? t('new.playersLeft', { count: missing }) : null
  return (
    <View style={styles.footer}>
      {hint ? (
        <Text variant="label" tone={issue ? color.warning : color.inkMuted} center accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
      <ErrorText error={state.startError} />
      <Button
        label={t('new.startGhost')}
        size="lg"
        block
        loading={state.starting}
        disabled={state.issues.length > 0}
        onPress={state.start}
        icon={<Ionicons name="play" size={20} color={color.onPrimary} />}
      />
    </View>
  )
}

/**
 * /game/new (modal): tap four players from the club list (first two Team A, next two Team B), or
 * add a guest, then start. No invites: whoever starts the game enters the scores.
 */
export default function NewGameScreen() {
  const { t } = useTranslation(['lobby', 'common'])
  const userId = useUserId()
  const { profile } = useSession()
  const { club, role } = useCurrentClub()
  const canAdd = role === 'owner' || role === 'admin'
  const [adding, setAdding] = useState(false)
  const [pickSeat, setPickSeat] = useState<SeatNo | null>(null)
  // A seat waiting for the player being created in New player (seated as soon as it exists).
  const [seatForNew, setSeatForNew] = useState<SeatNo | null>(null)
  const online = useOnlineMembers(club.id)
  // Who is at a table right now (games in progress, kept live by Realtime).
  const busy = busyPlayerIds(useLobby(club.id, userId).games)
  const state = useNewGame(club.id, { kind: 'member', userId, name: profile?.display_name ?? '' })

  return (
    <Screen
      title={t('new.title')}
      subtitle={t('new.subtitle')}
      actions={<CloseButton />}
      edges={['top', 'bottom']}
      footer={<StartBar state={state} />}>
      <TeamPanels
        slots={state.slots}
        meId={userId}
        onClear={state.clear}
        onPick={setPickSeat}
        onSwap={state.swap}
        onShuffle={state.reshuffle}
      />
      <MemberPicker
        clubId={club.id}
        meId={userId}
        slots={state.slots}
        online={online}
        onToggle={state.toggle}
        busy={busy}
        onAddPlayer={canAdd ? () => setAdding(true) : undefined}
      />
      <SeatPickerSheet
        clubId={club.id}
        meId={userId}
        seat={pickSeat}
        slots={state.slots}
        busy={busy}
        onPick={(seat, player) => {
          state.place(seat, player)
          setPickSeat(null)
        }}
        onNewPlayer={
          canAdd
            ? () => {
                setSeatForNew(pickSeat)
                setPickSeat(null)
                setAdding(true)
              }
            : undefined
        }
        onClose={() => setPickSeat(null)}
      />
      {canAdd ? (
        <AddPlayerSheet
          clubId={club.id}
          visible={adding}
          onClose={() => {
            setAdding(false)
            setSeatForNew(null)
          }}
          onCreated={(p) => {
            const player = { kind: 'member' as const, userId: p.userId, name: p.name }
            if (seatForNew) state.place(seatForNew, player)
            else state.toggle(player)
          }}
        />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  close: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.raised,
  },
  pressed: { opacity: 0.7 },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
})
