import type { ReactNode } from 'react'
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native'
import { formatNumber, formatSigned, usesNativeDigits } from '@/lib/format'
import { color, font, type } from '@/theme/tokens'

export type TextVariant = keyof typeof type

export interface TextProps extends RNTextProps {
  variant?: TextVariant
  tone?: string
  center?: boolean
  children?: ReactNode
}

export function Text({ variant = 'body', tone = color.ink, center, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[type[variant], { color: tone }, center && styles.center, style]} />
}

export interface ScoreProps extends Omit<TextProps, 'children' | 'variant'> {
  value: number
  size?: 'scoreSm' | 'score' | 'scoreXl'
  signed?: boolean
}

/**
 * Big tabular numbers for the table. The condensed score face only has Latin digits, so a
 * device that shows Arabic-Indic digits falls back to the Arabic UI face at the same size.
 */
export function Score({ value, size = 'score', signed, style, ...rest }: ScoreProps) {
  const native = usesNativeDigits()
  const text = signed ? formatSigned(value) : formatNumber(value)
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      {...rest}
      variant={size}
      style={[styles.tabular, native && { fontFamily: font.bold }, size === 'scoreXl' && scoreXlFit(text), style]}
      accessibilityLabel={String(value)}>
      {text}
    </Text>
  )
}

/**
 * Half a phone width holds about four big digits; longer totals ("1,600", "-1,250") shrink so they
 * are never cut off. adjustsFontSizeToFit does this on phones but not in the web build.
 */
export const scoreXlFit = (text: string): { fontSize: number; lineHeight: number } | null => {
  const scale = Math.min(1, 4 / Math.max(text.length, 1))
  return scale < 1 ? { fontSize: Math.round(72 * scale), lineHeight: Math.round(76 * scale) } : null
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
})
