import { Ionicons } from '@expo/vector-icons'
import { type Href, router } from 'expo-router'
import { I18nManager, Pressable, StyleSheet } from 'react-native'
import { HIT, color, radius, space } from '@/theme/tokens'

export interface BackButtonProps {
  label: string
  /** Where to go when there is no screen to go back to (e.g. opened from a deep link). */
  fallback: Href
  /** 'close' for modals. */
  icon?: 'back' | 'close'
}

export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}

/** Header back arrow that points the right way in RTL. */
export function BackButton({ label, fallback, icon = 'back' }: BackButtonProps) {
  const name = icon === 'close' ? 'close' : I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'
  return (
    <Pressable
      onPress={() => goBackOr(fallback)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={name} size={24} color={color.ink} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -space.sm,
  },
  pressed: { backgroundColor: color.raised },
})
