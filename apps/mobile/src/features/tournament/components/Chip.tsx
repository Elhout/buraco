import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'

export interface ChipProps {
  label: string
  /** Static chip (status) when no onPress. */
  onPress?: () => void
  selected?: boolean
  tone?: string
  accessibilityLabel?: string
}

/** Small pill: a status tag, or a quick-pick option (round length, target). */
export function Chip({ label, onPress, selected, tone = color.inkMuted, accessibilityLabel }: ChipProps) {
  const body = (
    <Text variant="caption" tone={selected ? color.onPrimary : tone}>
      {label}
    </Text>
  )
  if (!onPress) return <View style={[styles.chip, { borderColor: tone }]}>{body}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, styles.pick, selected && styles.selected, pressed && styles.pressed]}>
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    alignSelf: 'flex-start',
  },
  pick: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderColor: color.lineStrong },
  selected: { backgroundColor: color.primary, borderColor: color.primary },
  pressed: { opacity: 0.8 },
})
