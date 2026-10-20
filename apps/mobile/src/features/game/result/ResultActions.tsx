import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, StyleSheet, View } from 'react-native'
import { Banner, Button, ErrorText, PinSheet, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { formatNumber } from '@/lib/format'
import { color, space } from '@/theme/tokens'
import { confirmResult } from '../actions'
import { type GameView, teamNames } from '../model'
import { UndoApproveSheet, UndoRequestSheet } from '../live/UndoSheets'
import { opponentOf } from '../live/actionState'
import { useAction, useRefreshGame } from '../live/useAction'
import { type ResultSummary, shareParams } from './resultModel'

interface ActionsProps {
  readonly view: GameView
  readonly summary: ResultSummary
}

type ResultSheet = 'pin' | 'undo' | 'undoApprove' | null

function ConfirmButton({ view, summary, onPin }: ActionsProps & { onPin: () => void }) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  if (!view.awaitingMyResult) {
    if (!view.canScore || !view.myTeam) return null
    return (
      <Text variant="label" tone={color.inkMuted} center>
        {t('result.waitingOther', { team: opponentOf(view.myTeam) })}
      </Text>
    )
  }
  if (!view.isGhost) return <Button label={t('result.confirmPin')} size="lg" block onPress={onPin} />
  const tone = summary.winner === 'B' ? 'teamB' : summary.winner === 'A' ? 'teamA' : 'primary'
  return (
    <>
      <Button
        label={t('result.confirmGhost')}
        variant={tone}
        size="lg"
        block
        loading={action.busy}
        onPress={() => void action.run(() => confirmResult(view.game.id))}
      />
      <ErrorText error={action.error} />
    </>
  )
}

/** Before the result is final: sign it (PIN or one tap), or ask to undo the last round. */
export function PendingActions({ view, summary }: ActionsProps) {
  const { t } = useTranslation(['game', 'common'])
  const userId = useUserId()
  const refresh = useRefreshGame(view.game.id)
  const [sheet, setSheet] = useState<ResultSheet>(null)
  const close = (): void => setSheet(null)
  const params = {
    team: summary.winner ?? 'A',
    high: formatNumber(Math.max(summary.totals.A, summary.totals.B)),
    low: formatNumber(Math.min(summary.totals.A, summary.totals.B)),
  }
  const undoRequested = !view.isGhost && view.game.undo_requested_by !== null
  return (
    <View style={styles.stack}>
      <ConfirmButton view={view} summary={summary} onPin={() => setSheet('pin')} />
      {view.awaitingMyUndo ? (
        <Button label={t('menu.undoReview')} variant="secondary" block onPress={() => setSheet('undoApprove')} />
      ) : null}
      {view.canScore && !view.awaitingMyUndo ? (
        <View style={styles.undo}>
          <Button
            label={undoRequested ? t('menu.undoRequested') : t('result.undo')}
            variant="quiet"
            block
            disabled={undoRequested}
            onPress={() => setSheet('undo')}
          />
          <Text variant="caption" tone={color.inkFaint} center>
            {t('result.undoHint')}
          </Text>
        </View>
      ) : null}
      <PinSheet
        visible={sheet === 'pin'}
        userId={userId}
        title={t('result.confirmTitle')}
        subtitle={summary.winner ? t('result.confirmSubtitle', params) : t('result.confirmSubtitleDraw', params)}
        onSubmit={(pin) => confirmResult(view.game.id, pin)}
        onSuccess={() => {
          refresh()
          close()
        }}
        onClose={close}
      />
      <UndoRequestSheet visible={sheet === 'undo'} view={view} onClose={close} />
      {view.awaitingMyUndo ? <UndoApproveSheet visible={sheet === 'undoApprove'} view={view} onClose={close} /> : null}
    </View>
  )
}

/** After the result is final: share it, open the history detail, or go back to the lobby. */
export function FinalActions({ view, summary }: ActionsProps) {
  const { t } = useTranslation(['game', 'common'])
  const [shareError, setShareError] = useState<unknown>(null)
  const params = shareParams(summary, { A: teamNames(view, 'A'), B: teamNames(view, 'B') })
  const share = async (): Promise<void> => {
    if (!params) return
    const values = { ...params, team: params.winnerTeam ?? '', high: formatNumber(params.high), low: formatNumber(params.low) }
    const text = params.key === 'won' ? t('result.shareWon', values) : t('result.shareDraw', values)
    try {
      await Share.share({ message: view.needsVerification ? `${text} ${t('result.shareGhost')}` : text })
    } catch (e) {
      setShareError(e)
    }
  }
  return (
    <View style={styles.stack}>
      {view.needsVerification ? <Banner tone="ghost">{t('result.ghostNote')}</Banner> : null}
      {params ? <Button label={t('result.share')} size="lg" block onPress={() => void share()} /> : null}
      <ErrorText error={shareError} />
      <Button label={t('result.history')} variant="secondary" block onPress={() => router.push(`/history/${view.game.id}`)} />
      <Button label={t('result.lobby')} variant="quiet" block onPress={() => router.replace('/club')} />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  undo: { gap: space.xxs },
})
