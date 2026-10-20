import * as Haptics from 'expo-haptics'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { hasBiometricPin, unlockBiometricPin } from '@/lib/biometricPin'
import { toAppError } from '@/lib/errors'
import { PIN_LENGTH, type PinResult, minutesLeft } from '@/lib/pin'
import { color, radius, space } from '@/theme/tokens'
import { NumberPad } from './NumberPad'
import { Sheet } from './Sheet'
import { Text } from './Text'

export interface PinSheetProps {
  visible: boolean
  /** Signed-in user, for the optional biometric shortcut. */
  userId: string
  title?: string
  subtitle?: string
  /** Extra content above the pad, e.g. the round being confirmed. */
  summary?: React.ReactNode
  /** Calls the PIN-checking RPC. Resolve with its result; throw for other errors. */
  onSubmit: (pin: string) => Promise<PinResult>
  onSuccess: (result: Extract<PinResult, { ok: true }>) => void
  onClose: () => void
  onForgot?: () => void
}

/**
 * 4-digit PIN pad shown only on the player's own phone. Submits automatically on the 4th digit;
 * shows attempts left and the lockout countdown returned by the server.
 */
export function PinSheet({ visible, userId, title, subtitle, summary, onSubmit, onSuccess, onClose, onForgot }: PinSheetProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [bio, setBio] = useState(false)

  // Clear the pad each time the sheet opens (state adjusted during render, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setPin('')
      setMessage(null)
    }
  }

  useEffect(() => {
    if (!visible) return
    let active = true
    void hasBiometricPin(userId).then((enabled) => {
      if (active) setBio(enabled)
    })
    return () => {
      active = false
    }
  }, [visible, userId])

  const submit = async (value: string): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await onSubmit(value)
      if (result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        onSuccess(result)
        return
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setPin('')
      if (result.error === 'wrong_pin') setMessage(t('pin.wrong', { count: result.attempts_left ?? 0 }))
      else if (result.error === 'locked') setMessage(t('pin.locked', { count: minutesLeft(result.locked_until) }))
      else setMessage(t('pin.noPin'))
    } catch (error) {
      setPin('')
      setMessage(t(`errors.${toAppError(error).code}`))
    } finally {
      setBusy(false)
    }
  }

  const onDigit = (d: string): void => {
    if (busy || pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const unlockWithBiometrics = async (): Promise<void> => {
    const stored = await unlockBiometricPin(userId, t('pin.biometricPrompt'))
    if (stored) void submit(stored)
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? t('pin.title')} subtitle={subtitle ?? t('pin.subtitle')} locked={busy}>
      {summary}
      <View style={styles.dots} accessibilityLabel={`${pin.length} / ${PIN_LENGTH}`} accessibilityLiveRegion="polite">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled, message !== null && styles.dotError]} />
        ))}
      </View>
      <Text variant="label" tone={color.danger} center style={styles.message} accessibilityLiveRegion="assertive">
        {message ?? ' '}
      </Text>
      <NumberPad
        onDigit={onDigit}
        onDelete={() => setPin((p) => p.slice(0, -1))}
        deleteLabel={t('pin.delete')}
        disabled={busy}
        extraKey={
          bio
            ? { label: '', icon: 'finger-print', accessibilityLabel: t('pin.useBiometrics'), onPress: () => void unlockWithBiometrics() }
            : undefined
        }
      />
      {onForgot ? (
        <Text variant="label" tone={color.inkMuted} center onPress={onForgot} accessibilityRole="link" style={styles.forgot}>
          {t('pin.forgot')}
        </Text>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, direction: 'ltr' },
  dot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2, borderColor: color.inkMuted },
  dotFilled: { backgroundColor: color.primary, borderColor: color.primary },
  dotError: { borderColor: color.danger },
  message: { minHeight: 20 },
  forgot: { paddingVertical: space.sm },
})
