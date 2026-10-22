import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { color, radius, space } from '@/theme/tokens'

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
  const base = [styles.card, { backgroundColor: bg[tone] }, tone === 'sunken' && styles.flat, style]
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
    // Flat: a hairline separates the card from the page, in both themes.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    overflow: 'hidden',
  },
  flat: { borderColor: 'transparent' },
  accent: { position: 'absolute', top: space.md, bottom: space.md, start: 0, width: 3, borderTopEndRadius: 2, borderBottomEndRadius: 2 },
  pressed: { backgroundColor: color.raised },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.line },
})
