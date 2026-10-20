import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { envProblems } from '@/lib/env'
import { color, space } from '@/theme/tokens'
import { Text } from './ui/Text'

/** Shown instead of crashing when a build lacks EXPO_PUBLIC_* configuration. */
export function ConfigMissing() {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <Text variant="title" center>
        {t('errors.config')}
      </Text>
      <Text variant="caption" tone={color.inkMuted} center>
        {envProblems.join('\n')}
      </Text>
      <Text variant="caption" tone={color.inkFaint} center>
        apps/mobile/.env.example
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.felt, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
})
