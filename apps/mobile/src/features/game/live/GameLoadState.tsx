import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Button, EmptyState, useErrorText } from '@/components/ui'
import { color, space } from '@/theme/tokens'

interface GameLoadStateProps {
  readonly isPending: boolean
  readonly error: unknown
  readonly onRetry: () => void
}

/** Spinner while the game loads the first time; a retry when it couldn't be loaded. */
export function GameLoadState({ isPending, error, onRetry }: GameLoadStateProps) {
  const { t } = useTranslation(['game', 'common'])
  const errorText = useErrorText()
  if (isPending) return <ActivityIndicator color={color.ink} style={styles.loading} accessibilityLabel={t('common:loading')} />
  return (
    <EmptyState
      icon="alert-circle-outline"
      title={t('live.loadError')}
      body={error ? errorText(error) : undefined}
      action={<Button label={t('common:actions.retry')} variant="secondary" onPress={onRetry} />}
    />
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: space.xxxl },
})
