import { useTranslation } from 'react-i18next'
import { Button, ErrorText, Sheet, Text } from '@/components/ui'
import { color } from '@/theme/tokens'
import { reassignScorekeeper } from '../actions'
import type { GameView } from '../model'
import { scorekeeperCandidate } from './GameMenuSheet'
import { useAction } from './useAction'

interface ReassignSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
}

/** Hand my team's scoring to my partner (e.g. my battery is dying). */
export function ReassignSheet({ visible, view, onClose }: ReassignSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const action = useAction(view.game.id)
  const partner = scorekeeperCandidate(view)
  if (!partner) return null
  const submit = async (): Promise<void> => {
    if (await action.run(() => reassignScorekeeper(view.game.id, partner.seat))) onClose()
  }
  return (
    <Sheet visible={visible} onClose={onClose} locked={action.busy} title={t('reassign.title')}>
      <Text variant="body" tone={color.inkMuted} center>
        {t('reassign.body', { name: partner.name, team: partner.team })}
      </Text>
      <Button label={t('reassign.confirm')} size="lg" block loading={action.busy} onPress={() => void submit()} />
      <ErrorText error={action.error} />
      <Button label={t('common:actions.cancel')} variant="quiet" block onPress={onClose} />
    </Sheet>
  )
}
