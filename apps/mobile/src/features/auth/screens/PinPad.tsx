import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { NumberPad, Text } from '@/components/ui'
import { PIN_LENGTH } from '@/lib/pin'
import { color, radius, space } from '@/theme/tokens'

export interface PinPadProps {
  /** Digits typed so far (only the count is shown). */
  entry: string
  prompt: string
  message?: string | null
  /** Message is a problem (red) rather than a hint. */
  error?: boolean
  disabled?: boolean
  onDigit: (digit: string) => void
  onDelete: () => void
}

/** Dots + keypad for choosing a PIN. The dots and keys stay left-to-right, as on any phone. */
export function PinPad({ entry, prompt, message, error, disabled, onDigit, onDelete }: PinPadProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <Text variant="title" center accessibilityLiveRegion="polite">
        {prompt}
      </Text>
      <View style={styles.dots} accessibilityLabel={`${entry.length} / ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < entry.length && styles.dotFilled, error && styles.dotError]} />
        ))}
      </View>
      <Text variant="label" tone={error ? color.danger : color.inkMuted} center style={styles.message} accessibilityLiveRegion="assertive">
        {message ?? ' '}
      </Text>
      <NumberPad onDigit={onDigit} onDelete={onDelete} deleteLabel={t('pin.delete')} disabled={disabled} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, direction: 'ltr' },
  dot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2, borderColor: color.inkMuted },
  dotFilled: { backgroundColor: color.primary, borderColor: color.primary },
  dotError: { borderColor: color.danger },
  message: { minHeight: 20 },
})
