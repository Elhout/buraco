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
  return (
    <Text {...rest} variant={size} style={[styles.tabular, native && { fontFamily: font.bold }, style]} accessibilityLabel={String(value)}>
      {signed ? formatSigned(value) : formatNumber(value)}
    </Text>
  )
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
})
