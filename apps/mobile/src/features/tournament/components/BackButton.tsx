import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { I18nManager, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui'
import { HIT, color, space } from '@/theme/tokens'

/** Back to the tournament list; the arrow follows the layout direction. */
export function BackButton() {
  const { t } = useTranslation()
  const back = () => (router.canGoBack() ? router.back() : router.replace('/tournaments'))
  return (
    <Pressable accessibilityRole="button" onPress={back} hitSlop={8} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={color.inkMuted} />
      <Text variant="label" tone={color.inkMuted}>
        {t('actions.back')}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: HIT, alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
})
