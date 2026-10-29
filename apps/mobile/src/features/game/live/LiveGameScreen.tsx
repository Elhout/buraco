import type { Team } from '@buraco/shared'
import { useState } from 'react'
import { useNetInfo } from '@react-native-community/netinfo'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Screen, Text } from '@/components/ui'
import { usePendingRounds } from '@/lib/outbox'
import { useConnectionAlert } from '@/lib/realtime'
import { color, radius, space } from '@/theme/tokens'
import { useGame } from '../api'
import type { GameView, RoundView } from '../model'
import { ActionBar } from './ActionBar'
import { GameLoadState } from './GameLoadState'
import { GameStateCard } from './GameStateCard'
import { LiveBanners } from './LiveBanners'
import { LiveHeader } from './LiveHeader'
import { LiveSheets } from './LiveSheets'
import { RoundList } from './RoundList'
import { TotalsHeader } from './TotalsHeader'
import { planCutToggle } from './cutToggle'
import { useAction } from './useAction'
import { addCut, removeCut } from '../actions'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { EditRoundSheet } from '@/features/history/detail/OwnerSheets'
import { AdminGameButton } from '../AdminGameControls'
import { actionBlock, opponentOf } from './actionState'
import { buildRoundRows } from './roundRows'
import { useLiveFocus, useOutboxRefusal, usePostedRoundHaptics, useWatchers } from './useLiveEffects'
import { type LiveSheets as Sheets, useLiveSheets } from './useLiveSheets'

function DownBar() {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.down} accessibilityRole="alert">
      <Text variant="label" tone={color.ink} center>
        {t('common:connection.down')}
      </Text>
    </View>
  )
}

function Bar({ view, sheets, sendingCount, onEnter }: { view: GameView; sheets: Sheets; sendingCount: number; onEnter: () => void }) {
  const block = actionBlock({
    live: view.game.status === 'live',
    resultProposed: view.resultProposed,
    hasPendingRound: view.pendingRound !== null,
    awaitingMyConfirmation: view.awaitingMyConfirmation !== null,
    sendingCount,
  })
  const waitingFor = view.pendingRound?.enteredBy ? opponentOf(view.pendingRound.enteredBy.team) : null
  return (
    <ActionBar
      block={block}
      team={view.isGhost ? null : view.myTeam}
      waitingFor={waitingFor}
      isGhost={view.isGhost}
      onEnter={() => {
        onEnter()
        sheets.open('enter')
      }}
      onMenu={() => sheets.open('menu')}
    />
  )
}

/** /game/[id]: the scoreboard on all four phones and every spectator's. */
export function LiveGameScreen({ gameId }: { gameId: string }) {
  const { t } = useTranslation(['game', 'common'])
  const { view, isPending, error, realtime, dataUpdatedAt, refetch } = useGame(gameId)
  const live = view?.game.status === 'live'
  const outbox = usePendingRounds(gameId)
  const net = useNetInfo()
  const down = useConnectionAlert(realtime)
  const watchers = useWatchers(gameId, view)
  const refusal = useOutboxRefusal(gameId)
  const sheets = useLiveSheets(view)
  const [entryFocus, setEntryFocus] = useState<Team>('A')
  const cutAction = useAction(gameId)
  const { role, club } = useCurrentClub()
  const [editing, setEditing] = useState<RoundView | null>(null)
  useLiveFocus(gameId)
  usePostedRoundHaptics(view ? view.rounds.filter((r) => r.status === 'confirmed').length : null)

  if (!view) {
    return (
      <Screen title={t('live.title')}>
        <GameLoadState isPending={isPending} error={error} onRetry={() => void refetch()} />
      </Screen>
    )
  }

  // +100 under each team's score (one team per deal; a second tap removes it).
  const dealLines = view.openRound?.lines ?? []
  const toggleCut = (team: Team): void => {
    const plan = planCutToggle(team, dealLines, view.seats)
    void cutAction.run(async () => {
      for (const id of plan.remove) await removeCut(id)
      if (plan.add !== null) await addCut(view.game.id, plan.add)
    })
  }
  // Who's watching: for admins and the players at this table.
  const canSeeWatchers = view.mySeat !== null || role === 'owner' || role === 'admin'

  // Double-tap a counted round to fix it: the game's creator, or the club owner (silently).
  const canEditRounds = live && view.game.tournament_match_id === null && (view.isHost || role === 'owner')
  const rows = buildRoundRows({ rounds: view.rounds, seats: view.seats, outbox, cutBonus: view.config.cutBonus })
  const showBar = view.canScore && live
  // Tapping a team's score opens round entry for that team, when the Enter round button would work.
  const canEnter =
    showBar &&
    actionBlock({
      live,
      resultProposed: view.resultProposed,
      hasPendingRound: view.pendingRound !== null,
      awaitingMyConfirmation: view.awaitingMyConfirmation !== null,
      sendingCount: outbox.length,
    }) === null
  return (
    <Screen
      footer={showBar ? <Bar view={view} sheets={sheets} sendingCount={outbox.length} onEnter={() => setEntryFocus('A')} /> : undefined}
      onRefresh={() => void refetch()}>
      <LiveHeader
        title={t('live.title')}
        isGhost={view.isGhost}
        watchers={canSeeWatchers ? { count: watchers.length, onPress: () => sheets.open('watchers') } : undefined}
        action={<AdminGameButton gameId={view.game.id} status={view.game.status} />}
      />
      {down && live ? <DownBar /> : null}
      <TotalsHeader
        view={view}
        cut={
          canEnter
            ? {
                bonus: view.config.cutBonus,
                cutBy: [...new Set(dealLines.map((l) => l.team))],
                busy: cutAction.busy,
                onToggle: toggleCut,
              }
            : undefined
        }
        onTeamPress={
          canEnter
            ? (team) => {
                setEntryFocus(team)
                sheets.open('enter')
              }
            : undefined
        }
      />
      <LiveBanners
        view={view}
        offline={net.isConnected === false}
        refusal={refusal.code}
        onDismissRefusal={refusal.clear}
        onOpen={sheets.open}
      />
      <GameStateCard view={view} />
      <RoundList rows={rows} isGhost={view.isGhost} updatedAt={dataUpdatedAt} onEditRound={canEditRounds ? setEditing : undefined} />
      {editing ? <EditRoundSheet gameId={view.game.id} clubId={club.id} round={editing} onClose={() => setEditing(null)} /> : null}
      <LiveSheets view={view} sheets={sheets} watchers={watchers} entryFocus={entryFocus} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  down: { backgroundColor: color.danger, borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
})
