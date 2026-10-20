import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Card, Text } from '@/components/ui'
import { color } from '@/theme/tokens'
import type { GameView } from '../model'

/**
 * Shown instead of the scoring controls when the game is not live: still inviting, expired,
 * finished (link to the result and history) or abandoned.
 */
export function GameStateCard({ view }: { view: GameView }) {
  const { t } = useTranslation(['game', 'common'])
  const { game } = view
  const id = game.id
  switch (game.status) {
    case 'draft':
    case 'inviting':
      return (
        <Card>
          <Text variant="bodyStrong">{t('live.inviting')}</Text>
          <Button label={t('live.openInvite')} variant="secondary" block onPress={() => router.replace(`/game/${id}/invite`)} />
        </Card>
      )
    case 'expired':
      return (
        <Card>
          <Text variant="bodyStrong">{t('live.expired')}</Text>
          <Button label={t('live.backToLobby')} variant="secondary" block onPress={() => router.replace('/club')} />
        </Card>
      )
    case 'finished':
      return (
        <Card accent={color.success}>
          <Text variant="title">{t('live.finished')}</Text>
          <Button label={t('live.resultOpen')} size="lg" block onPress={() => router.push(`/game/${id}/result`)} />
          <Button label={t('live.openHistory')} variant="secondary" block onPress={() => router.push(`/history/${id}`)} />
        </Card>
      )
    case 'abandoned':
      return (
        <Card accent={color.danger}>
          <Text variant="bodyStrong">{t('live.abandoned')}</Text>
          <Button label={t('live.openHistory')} variant="secondary" block onPress={() => router.push(`/history/${id}`)} />
          <Button label={t('live.backToLobby')} variant="quiet" block onPress={() => router.replace('/club')} />
        </Card>
      )
    case 'live':
      return null
  }
}
