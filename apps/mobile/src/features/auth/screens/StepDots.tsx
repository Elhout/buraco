import { StyleSheet, View } from 'react-native'
import { color, radius, space } from '@/theme/tokens'

export interface StepDotsProps {
  step: number
  total: number
  label: string
}

/** Onboarding progress: profile → PIN → club. */
export function StepDots({ step, total, label }: StepDotsProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.bar, i < step && styles.done, i === step - 1 && styles.current]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
  bar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.line },
  done: { backgroundColor: color.lineStrong },
  current: { backgroundColor: color.teamA },
})
