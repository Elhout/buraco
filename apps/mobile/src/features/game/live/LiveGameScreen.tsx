import { useNetInfo } from '@react-native-community/netinfo'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Screen, Text } from '@/components/ui'
import { usePendingRounds } from '@/lib/outbox'
import { useConnectionAlert } from '@/lib/realtime'
import { color, radius, space } from '@/theme/tokens'
import { useGame } from '../api'
import type { GameView } from '../model'
import { ActionBar } from './ActionBar'
import { GameLoadState } from './GameLoadState'
import { GameStateCard } from './GameStateCard'
import { LiveBanners } from './LiveBanners'
import { LiveHeader } from './LiveHeader'
import { LiveSheets } from './LiveSheets'
import { RoundList } from './RoundList'
import { TotalsHeader } from './TotalsHeader'
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

function Bar({ view, sheets, sendingCount }: { view: GameView; sheets: Sheets; sendingCount: number }) {
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
      cutBonus={view.config.cutBonus}
      onEnter={() => sheets.open('enter')}
      onCut={() => sheets.open('cut')}
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
  useLiveFocus(gameId, live)
  usePostedRoundHaptics(view ? view.rounds.filter((r) => r.status === 'confirmed').length : null)

  if (!view) {
    return (
      <Screen title={t('live.title')}>
        <GameLoadState isPending={isPending} error={error} onRetry={() => void refetch()} />
      </Screen>
    )
  }

  const rows = buildRoundRows({ rounds: view.rounds, seats: view.seats, outbox, cutBonus: view.config.cutBonus })
  const showBar = view.canScore && live
  return (
    <Screen
      footer={showBar ? <Bar view={view} sheets={sheets} sendingCount={outbox.length} /> : undefined}
      onRefresh={() => void refetch()}>
      <LiveHeader
        title={t('live.title')}
        isGhost={view.isGhost}
        watchers={{ count: watchers.length, onPress: () => sheets.open('watchers') }}
      />
      {down && live ? <DownBar /> : null}
      <TotalsHeader view={view} />
      <LiveBanners
        view={view}
        offline={net.isConnected === false}
        refusal={refusal.code}
        onDismissRefusal={refusal.clear}
        onOpen={sheets.open}
      />
      <GameStateCard view={view} />
      <RoundList rows={rows} isGhost={view.isGhost} updatedAt={dataUpdatedAt} />
      <LiveSheets view={view} sheets={sheets} watchers={watchers} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  down: { backgroundColor: color.danger, borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
})
