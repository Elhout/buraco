import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { color, elevation, radius, space } from '@/theme/tokens'

export interface CardProps {
  children: ReactNode
  onPress?: () => void
  /** Coloured edge, e.g. a team colour or ghost lilac. */
  accent?: string
  tone?: 'surface' | 'raised' | 'sunken'
  style?: ViewStyle
  accessibilityLabel?: string
}

const bg = { surface: color.surface, raised: color.raised, sunken: color.sunken } as const

export function Card({ children, onPress, accent, tone = 'surface', style, accessibilityLabel }: CardProps) {
  const body = (
    <>
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      {children}
    </>
  )
  const base = [styles.card, { backgroundColor: bg[tone] }, tone !== 'sunken' && elevation.card, style]
  if (!onPress) return <View style={base}>{body}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}>
      {body}
    </Pressable>
  )
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>
}

export function Stack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ gap }, style]}>{children}</View>
}

export function Divider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', top: 0, bottom: 0, start: 0, width: 4 },
  pressed: { backgroundColor: color.raised, transform: [{ scale: 0.99 }] },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.line },
})
