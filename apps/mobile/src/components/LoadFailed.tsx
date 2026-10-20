import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { color, space } from '@/theme/tokens'
import { Button } from './ui/Button'
import { Text } from './ui/Text'

/** Startup data (profile, clubs) failed to load: retry instead of guessing an onboarding step. */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <Text variant="title" center>
        {t('errors.network')}
      </Text>
      <Button label={t('actions.retry')} onPress={onRetry} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.felt, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
})
