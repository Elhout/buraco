import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View } from 'react-native'
import { HIT, color, radius, space } from '@/theme/tokens'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'teamA' | 'teamB'

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string
  variant?: ButtonVariant
  size?: 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  block?: boolean
}

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: color.primary, fg: color.onPrimary, border: color.primary },
  secondary: { bg: 'transparent', fg: color.ink, border: color.lineStrong },
  quiet: { bg: 'transparent', fg: color.inkMuted, border: 'transparent' },
  danger: { bg: color.dangerSoft, fg: color.danger, border: color.danger },
  teamA: { bg: color.teamA, fg: color.onPrimary, border: color.teamA },
  teamB: { bg: color.teamB, fg: color.onPrimary, border: color.teamB },
}

export function Button({ label, variant = 'primary', size = 'md', loading, icon, block, disabled, onPress, ...rest }: ButtonProps) {
  const p = palette[variant]
  const inactive = disabled || loading
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={(e) => {
        void Haptics.selectionAsync()
        onPress?.(e)
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        block && styles.block,
        { backgroundColor: p.bg, borderColor: p.border },
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={p.fg} /> : icon}
        <Text variant={size === 'lg' ? 'bodyStrong' : 'label'} tone={p.fg}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: { minHeight: 60, paddingHorizontal: space.xl },
  block: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
  inactive: { opacity: 0.45 },
})
