import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'

export type ChipTone = 'live' | 'inviting' | 'ghost' | 'neutral'

const tones: Record<ChipTone, { fg: string; bg: string }> = {
  live: { fg: color.success, bg: color.successSoft },
  inviting: { fg: color.warning, bg: color.raised },
  ghost: { fg: color.ghost, bg: color.ghostSoft },
  neutral: { fg: color.inkMuted, bg: color.raised },
}

export interface ChipProps {
  label: string
  tone: ChipTone
  icon?: keyof typeof Ionicons.glyphMap
  /** A pulsing-style dot for "live" status. */
  dot?: boolean
}

/** Small status pill used on lobby cards and the invite screen. */
export function Chip({ label, tone, icon, dot }: ChipProps) {
  const p = tones[tone]
  return (
    <View style={[styles.chip, { backgroundColor: p.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: p.fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={14} color={p.fg} /> : null}
      <Text variant="caption" tone={p.fg} style={styles.label}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { textTransform: 'uppercase', letterSpacing: 1 },
})
