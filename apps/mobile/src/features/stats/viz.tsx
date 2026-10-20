import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { usesNativeDigits } from '@/lib/format'
import { color, font, radius, space } from '@/theme/tokens'

/**
 * Small, honest data viz for stats: big numbers for headlines, bars that grow from the start
 * edge (mirrors in RTL because rows follow layout direction), all from tokens.
 */

export interface BigNumberProps {
  text: string
  size?: 'scoreSm' | 'score' | 'scoreXl'
  tone?: string
}

/** Pre-formatted number in the condensed score face (falls back for native digits, like <Score>). */
export function BigNumber({ text, size = 'score', tone = color.ink }: BigNumberProps) {
  return (
    <Text variant={size} tone={tone} style={[styles.tabular, usesNativeDigits() && { fontFamily: font.bold }]}>
      {text}
    </Text>
  )
}

export interface RateBarProps {
  /** 0..1 */
  rate: number
  tone?: string
  height?: number
}

export function RateBar({ rate, tone = color.teamA, height = 6 }: RateBarProps) {
  const pct = Math.max(0, Math.min(1, rate)) * 100
  return (
    <View style={[styles.track, { height }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={{ width: `${pct}%`, backgroundColor: tone, borderRadius: radius.pill }} />
    </View>
  )
}

export interface Segment {
  readonly value: number
  readonly tone: string
}

/** Proportional segments in one bar (e.g. wins / draws / losses, or side 1 vs side 2). */
export function SplitBar({ segments, height = 10 }: { segments: readonly Segment[]; height?: number }) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0)
  return (
    <View style={[styles.track, styles.split, { height }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {total > 0
        ? segments.map((s, i) => (s.value > 0 ? <View key={i} style={{ flex: s.value, backgroundColor: s.tone }} /> : null))
        : null}
    </View>
  )
}

export interface StatTileProps {
  label: string
  value: string
  sub?: string
  /** Full sentence for screen readers; defaults to "label: value". */
  accessibilityLabel?: string
  tone?: string
}

export function StatTile({ label, value, sub, accessibilityLabel, tone }: StatTileProps) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={accessibilityLabel ?? `${label}: ${value}${sub ? `, ${sub}` : ''}`}>
      <Text variant="caption" tone={color.inkMuted} numberOfLines={1}>
        {label}
      </Text>
      <BigNumber text={value} size="scoreSm" tone={tone} />
      {sub ? (
        <Text variant="caption" tone={color.inkFaint} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

/** Two-column grid for tiles. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  track: { flexDirection: 'row', backgroundColor: color.sunken, borderRadius: radius.pill, overflow: 'hidden' },
  split: { gap: 2 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
