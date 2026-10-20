import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, PinSheet, Sheet, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { formatNumber } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import { approveUndo, rejectUndo, requestUndo } from '../actions'
import type { GameView, RoundView } from '../model'
import { opponentOf } from './actionState'
import { useAction, useRefreshGame } from './useAction'

interface UndoSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

const lastConfirmed = (view: GameView): RoundView | null => view.rounds.filter((r) => r.status === 'confirmed').at(-1) ?? null

const roundParams = (round: RoundView | null) => ({
  n: formatNumber(round?.displayNo ?? 0),
  a: formatNumber(round?.withBonus.A ?? 0),
  b: formatNumber(round?.withBonus.B ?? 0),
})

/** Ask to undo the last confirmed round. Ghost games undo at once; normal games wait for the other team. */
export function UndoRequestSheet({ visible, view, onClose }: UndoSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  const params = roundParams(lastConfirmed(view))
  const other = opponentOf(view.myTeam ?? 'A')
  const submit = async (): Promise<void> => {
    if (!(await action.run(() => requestUndo(view.game.id)))) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onClose()
  }
  return (
    <Sheet visible={visible} onClose={onClose} locked={action.busy} title={t('undo.requestTitle')}>
      <Text variant="body" tone={color.inkMuted} center>
        {view.isGhost ? t('undo.ghostBody', params) : t('undo.requestBody', { ...params, team: other })}
      </Text>
      <Button
        label={view.isGhost ? t('undo.now') : t('undo.request')}
        variant="danger"
        size="lg"
        block
        loading={action.busy}
        onPress={() => void submit()}
      />
      <ErrorText error={action.error} />
      <Button label={t('common:actions.cancel')} variant="quiet" block onPress={onClose} />
    </Sheet>
  )
}

/** The other team asked to undo: approve with my PIN, or reject. */
export function UndoApproveSheet({ visible, view, onClose }: UndoSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const userId = useUserId()
  const refresh = useRefreshGame(view.game.id)
  const reject = useAction(view.game.id)
  const requester = view.game.undo_requested_by ?? opponentOf(view.myTeam ?? 'A')
  const onReject = async (): Promise<void> => {
    if (await reject.run(() => rejectUndo(view.game.id))) onClose()
  }
  return (
    <PinSheet
      visible={visible}
      userId={userId}
      title={t('undo.approveTitle')}
      subtitle={t('undo.approveBody', { ...roundParams(lastConfirmed(view)), team: requester })}
      summary={
        <View style={styles.summary}>
          <Button label={t('undo.reject')} variant="secondary" block loading={reject.busy} onPress={() => void onReject()} />
          <ErrorText error={reject.error} />
        </View>
      }
      onSubmit={(pin) => approveUndo(view.game.id, pin)}
      onSuccess={() => {
        refresh()
        onClose()
      }}
      onClose={onClose}
    />
  )
}

const styles = StyleSheet.create({
  summary: { gap: space.xs, borderRadius: radius.md },
})
