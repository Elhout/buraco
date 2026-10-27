import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Card, Screen, Text } from '@/components/ui'
import { color } from '@/theme/tokens'
import { useGame } from '../api'
import type { GameView } from '../model'
import { GameLoadState } from '../live/GameLoadState'
import { LiveHeader } from '../live/LiveHeader'
import { useLiveFocus } from '../live/useLiveEffects'
import { Confirmations, Players } from './ResultDetails'
import { FinalActions, PendingActions } from './ResultActions'
import { WinnerHero } from './WinnerHero'
import { resultSummary } from './resultModel'

function NotDecided({ view }: { view: GameView }) {
  const { t } = useTranslation(['game', 'common'])
  const abandoned = view.game.status === 'abandoned'
  return (
    <Card accent={abandoned ? color.danger : undefined}>
      <Text variant="title">{abandoned ? t('result.abandoned') : t('result.notOver')}</Text>
      {abandoned ? (
        <>
          <Text variant="body" tone={color.inkMuted}>
            {t('result.abandonedBody')}
          </Text>
          <Button label={t('result.history')} variant="secondary" block onPress={() => router.push(`/history/${view.game.id}`)} />
          <Button label={t('result.lobby')} variant="quiet" block onPress={() => router.replace('/club')} />
        </>
      ) : (
        <Button label={t('result.backToGame')} block onPress={() => router.replace(`/game/${view.game.id}`)} />
      )}
    </Card>
  )
}

function ResultBody({ view }: { view: GameView }) {
  const summary = resultSummary(view)
  if (summary.kind === 'abandoned' || summary.kind === 'inProgress') return <NotDecided view={view} />
  return (
    <>
      <WinnerHero view={view} summary={summary} />
      {summary.final ? <FinalActions view={view} summary={summary} /> : <Confirmations summary={summary} />}
      {summary.final ? null : <PendingActions view={view} summary={summary} />}
      <Players view={view} />
    </>
  )
}

/** /game/[id]/result: winner, final totals, both-team confirmation, then share. */
export function ResultScreen({ gameId }: { gameId: string }) {
  const { t } = useTranslation(['game', 'common'])
  const { view, isPending, error, refetch } = useGame(gameId)
  // Suppresses pushes about this game (e.g. "final result awaiting confirmation") while open.
  useLiveFocus(gameId)
  const final = view?.game.status === 'finished'
  const title = final ? t('result.title') : t('result.proposedTitle')
  return (
    <Screen onRefresh={() => void refetch()}>
      <LiveHeader title={title} isGhost={view?.isGhost ?? false} />
      {view ? <ResultBody view={view} /> : <GameLoadState isPending={isPending} error={error} onRetry={() => void refetch()} />}
    </Screen>
  )
}
