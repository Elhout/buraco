import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, Score, Sheet, Stack, TeamBadge } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { space, teamColor } from '@/theme/tokens'
import { confirmResult, continueGame } from '../actions'
import { isGameAdmin } from '../AdminGameControls'
import type { GameView } from '../model'
import { useAction, useRefreshGame } from './useAction'

/** Who decides when a team reaches the target: the table's scorer(s), the owner and admins. Not in tournaments. */
export const canDecideTarget = (view: GameView, role: string): boolean =>
  view.resultProposed && view.game.tournament_match_id === null && (view.canScore || isGameAdmin(role))

interface TargetReachedSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

/** "Team A reached 2,000": end the game now, or keep playing with extra rounds. */
export function TargetReachedSheet({ visible, view, onClose }: TargetReachedSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const refresh = useRefreshGame(view.game.id)
  const action = useAction(view.game.id)
  const winner = view.game.proposed_winner
  const end = (): void => {
    if (!view.isGhost) {
      // Games with invites: both teams confirm the result with their PIN on the result screen.
      onClose()
      router.push(`/game/${view.game.id}/result`)
      return
    }
    void action.run(async () => {
      await confirmResult(view.game.id)
      refresh()
      onClose()
      router.push(`/game/${view.game.id}/result`)
    })
  }
  const keepPlaying = (): void => {
    void action.run(async () => {
      await continueGame(view.game.id)
      refresh()
      onClose()
    })
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={winner ? t('target.title', { team: winner, points: formatNumber(view.config.targetScore) }) : t('target.titleClock')}
      subtitle={t('target.body')}
      locked={action.busy}>
      <View style={styles.score}>
        {(['A', 'B'] as const).map((team) => (
          <View key={team} style={styles.team}>
            <TeamBadge team={team} />
            <Score value={view.totals[team]} size="score" tone={teamColor(team)} />
          </View>
        ))}
      </View>
      <Stack gap={space.md}>
        <ErrorText error={action.error} />
        <Button label={t('target.end')} size="lg" block loading={action.busy} onPress={end} />
        <Button label={t('target.keepPlaying')} variant="secondary" size="lg" block disabled={action.busy} onPress={keepPlaying} />
      </Stack>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  score: { flexDirection: 'row', justifyContent: 'space-around' },
  team: { alignItems: 'center', gap: space.xs },
})
