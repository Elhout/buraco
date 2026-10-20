import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Pressable, StyleSheet, View } from 'react-native'
import { color, radius, space } from '@/theme/tokens'
import { Text } from './Text'

export interface NumberPadProps {
  onDigit: (digit: string) => void
  onDelete: () => void
  /** Optional bottom-left key, e.g. a minus sign or biometric shortcut. */
  extraKey?: { label: string; accessibilityLabel: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }
  deleteLabel: string
  disabled?: boolean
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const

/** Phone-style keypad. Always laid out left-to-right, as on every phone, even in Arabic. */
export function NumberPad({ onDigit, onDelete, extraKey, deleteLabel, disabled }: NumberPadProps) {
  const press = (fn: () => void) => () => {
    if (disabled) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    fn()
  }
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((d) => (
            <Key key={d} label={d} onPress={press(() => onDigit(d))} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {extraKey ? (
          <Key
            label={extraKey.label}
            icon={extraKey.icon}
            accessibilityLabel={extraKey.accessibilityLabel}
            onPress={press(extraKey.onPress)}
            subtle
          />
        ) : (
          <View style={styles.key} />
        )}
        <Key label="0" onPress={press(() => onDigit('0'))} />
        <Key label="" icon="backspace-outline" accessibilityLabel={deleteLabel} onPress={press(onDelete)} subtle />
      </View>
    </View>
  )
}

interface KeyProps {
  label: string
  onPress: () => void
  icon?: keyof typeof Ionicons.glyphMap | undefined
  accessibilityLabel?: string
  subtle?: boolean
}

function Key({ label, onPress, icon, accessibilityLabel, subtle }: KeyProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.key, !subtle && styles.keyFilled, pressed && styles.keyPressed]}>
      {icon ? <Ionicons name={icon} size={26} color={color.ink} /> : <Text variant="scoreSm">{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pad: { gap: space.sm, direction: 'ltr' },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  key: { flex: 1, maxWidth: 110, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  keyFilled: { backgroundColor: color.raised },
  keyPressed: { backgroundColor: color.lineStrong },
})
