import type { Team } from '@buraco/shared'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, PinSheet, Score, Sheet, TeamBadge, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { formatNumber } from '@/lib/format'
import { color, radius, space, teamColor } from '@/theme/tokens'
import { confirmRound, disputeRound } from '../actions'
import type { GameView, RoundView } from '../model'
import { DealCuts } from './DealCuts'
import { opponentOf } from './actionState'
import { useAction, useRefreshGame } from './useAction'

interface ConfirmRoundSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly round: RoundView
  readonly onClose: () => void
}

function RoundSummary({ round }: { round: RoundView }) {
  const side = (team: Team) => (
    <View style={styles.side}>
      <TeamBadge team={team} />
      <Score value={(team === 'A' ? round.teamA : round.teamB) ?? 0} size="score" tone={teamColor(team)} />
    </View>
  )
  return (
    <View style={styles.summary}>
      <View style={styles.sides}>
        {side('A')}
        {side('B')}
      </View>
      <DealCuts lines={round.lines} />
    </View>
  )
}

interface DisputeActionProps {
  readonly gameId: string
  readonly round: RoundView
  readonly enteringTeam: Team
  readonly onDone: () => void
}

function DisputeAction({ gameId, round, enteringTeam, onDone }: DisputeActionProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(gameId)
  const dispute = async (): Promise<void> => {
    if (!(await action.run(() => disputeRound(round.id)))) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    onDone()
  }
  return (
    <View style={styles.dispute}>
      <Button label={t('confirm.dispute')} variant="danger" block loading={action.busy} onPress={() => void dispute()} />
      <Text variant="caption" tone={color.inkMuted} center>
        {t('confirm.disputeHint', { team: enteringTeam })}
      </Text>
      <ErrorText error={action.error} />
    </View>
  )
}

function GhostConfirm({ view, round, visible, onClose }: ConfirmRoundSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  const confirm = async (): Promise<void> => {
    if (await action.run(() => confirmRound(round.id))) onClose()
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      locked={action.busy}
      title={t('confirm.title', { n: formatNumber(round.displayNo) })}
      subtitle={t('confirm.subtitleGhost')}>
      <RoundSummary round={round} />
      <Button label={t('confirm.confirm')} size="lg" block loading={action.busy} onPress={() => void confirm()} />
      <ErrorText error={action.error} />
      <DisputeAction
        gameId={view.game.id}
        round={round}
        enteringTeam={round.enteredBy?.team ?? opponentOf(view.myTeam ?? 'B')}
        onDone={onClose}
      />
    </Sheet>
  )
}

/**
 * Opens on the phone that must confirm: normal games sign with the PIN (PinSheet with the round
 * as summary), ghost games confirm with one tap. Dispute sends it back to the entering team.
 */
export function ConfirmRoundSheet(props: ConfirmRoundSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const userId = useUserId()
  const { view, round, visible, onClose } = props
  const refresh = useRefreshGame(view.game.id)
  if (view.isGhost) return <GhostConfirm {...props} />
  const entering = round.enteredBy?.team ?? opponentOf(view.myTeam ?? 'A')
  return (
    <PinSheet
      visible={visible}
      userId={userId}
      title={t('confirm.title', { n: formatNumber(round.displayNo) })}
      subtitle={t('confirm.subtitle', { team: entering })}
      summary={
        <>
          <RoundSummary round={round} />
          <DisputeAction gameId={view.game.id} round={round} enteringTeam={entering} onDone={onClose} />
        </>
      }
      onSubmit={(pin) => confirmRound(round.id, pin)}
      onSuccess={() => {
        refresh()
        onClose()
      }}
      onClose={onClose}
    />
  )
}

const styles = StyleSheet.create({
  summary: { backgroundColor: color.sunken, borderRadius: radius.md, padding: space.md, gap: space.md },
  sides: { flexDirection: 'row', gap: space.md },
  side: { flex: 1, alignItems: 'center', gap: space.xs },
  dispute: { gap: space.xs },
})
