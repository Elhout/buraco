import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { AdminGameSheet, isGameAdmin } from '../AdminGameControls'
import type { Team } from '@buraco/shared'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, PinSheet, Sheet, TeamBadge, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { color, radius, space } from '@/theme/tokens'
import { abandonGame } from '../actions'
import type { GameView } from '../model'
import { opponentOf } from './actionState'
import { useAction, useRefreshGame } from './useAction'

interface AbandonSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

/** Which team already approved abandoning (normal games need both scorekeepers' PIN). */
function Approvals({ approvals }: { approvals: readonly Team[] }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.approvals}>
      {(['A', 'B'] as const).map((team) => {
        const done = approvals.includes(team)
        return (
          <View key={team} style={styles.approval}>
            <TeamBadge team={team} size="sm" />
            <Text variant="label" tone={done ? color.success : color.inkMuted} style={styles.flex}>
              {done ? t('abandon.approved', { team }) : t('abandon.waiting', { team })}
            </Text>
            <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? color.success : color.inkFaint} />
          </View>
        )
      })}
    </View>
  )
}

function GhostAbandon({ visible, view, onClose }: AbandonSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  const submit = async (): Promise<void> => {
    if (await action.run(() => abandonGame(view.game.id))) onClose()
  }
  return (
    <Sheet visible={visible} onClose={onClose} locked={action.busy} title={t('abandon.title')} subtitle={t('abandon.bodyGhost')}>
      <Button label={t('abandon.now')} variant="danger" size="lg" block loading={action.busy} onPress={() => void submit()} />
      <ErrorText error={action.error} />
      <Button label={t('common:actions.cancel')} variant="quiet" block onPress={onClose} />
    </Sheet>
  )
}

/** Abandon: ghost is one tap; normal needs each team's scorekeeper to sign with their PIN. */
export function AbandonSheet(props: AbandonSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const userId = useUserId()
  const refresh = useRefreshGame(props.view.game.id)
  const { visible, view, onClose } = props
  const { role } = useCurrentClub()
  // The owner and admins end the game at once: no PINs, no waiting for the other team.
  if (isGameAdmin(role)) return visible ? <AdminGameSheet gameId={view.game.id} initialAction="end" onClose={onClose} /> : null
  if (view.isGhost) return <GhostAbandon {...props} />
  const approvals = view.game.abandon_approvals ?? []
  if (view.myAbandonApproved) {
    return (
      <Sheet visible={visible} onClose={onClose} title={t('abandon.title')}>
        <Approvals approvals={approvals} />
        <Text variant="body" tone={color.inkMuted} center>
          {t('abandon.youApproved', { team: opponentOf(view.myTeam ?? 'A') })}
        </Text>
        <Button label={t('common:actions.close')} variant="secondary" block onPress={onClose} />
      </Sheet>
    )
  }
  return (
    <PinSheet
      visible={visible}
      userId={userId}
      title={t('abandon.title')}
      subtitle={t('abandon.body')}
      summary={<Approvals approvals={approvals} />}
      onSubmit={(pin) => abandonGame(view.game.id, pin)}
      onSuccess={() => {
        refresh()
        onClose()
      }}
      onClose={onClose}
    />
  )
}

const styles = StyleSheet.create({
  approvals: { backgroundColor: color.sunken, borderRadius: radius.md, padding: space.md, gap: space.sm },
  approval: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
})
