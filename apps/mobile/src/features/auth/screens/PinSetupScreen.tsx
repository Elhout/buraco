import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Screen, Stack, Text, useErrorText } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { biometricsAvailable, enableBiometricPin } from '@/lib/biometricPin'
import { toAppError } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { color, radius, space } from '@/theme/tokens'
import { PinPad } from './PinPad'
import { StepDots } from './StepDots'
import { usePinChooser } from './usePinChooser'

/**
 * Onboarding step 2: choose a 4-digit PIN, repeat it, store it with set_pin. Then offer the
 * biometric shortcut. refreshProfile() at the end lets the session stage move on.
 */
export function PinSetupScreen() {
  const { t } = useTranslation('auth')
  const { userId, refreshProfile } = useSession()
  const errorText = useErrorText()
  const chooser = usePinChooser()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedPin, setSavedPin] = useState<string | null>(null)

  const save = async (pin: string): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await rpc('set_pin', { p_pin: pin })
    } catch (failure) {
      // Already set (e.g. a second phone finished onboarding first): nothing left to do here.
      if (toAppError(failure).code === 'pinAlreadySet') return refreshProfile()
      setSaving(false)
      setError(errorText(failure))
      chooser.reset()
      return
    }
    if (await biometricsAvailable().catch(() => false)) {
      setSaving(false)
      setSavedPin(pin)
    } else await refreshProfile()
  }

  if (savedPin && userId) return <BiometricOffer userId={userId} pin={savedPin} onDone={() => void refreshProfile()} />

  return (
    <Screen contentStyle={styles.content}>
      <StepDots step={2} total={3} label={t('onboarding.step', { step: 2, total: 3 })} />
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('pinSetup.title')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('pinSetup.subtitle')}
        </Text>
      </Stack>
      <PinPad
        entry={chooser.draft.entry}
        prompt={chooser.prompt}
        message={error ?? chooser.hint ?? (saving ? t('pinSetup.saving') : t('pinSetup.hint'))}
        error={error !== null || chooser.hint !== null}
        disabled={saving}
        onDigit={(d) => {
          setError(null)
          const pin = chooser.onDigit(d)
          if (pin) void save(pin)
        }}
        onDelete={chooser.onDelete}
      />
    </Screen>
  )
}

interface BiometricOfferProps {
  userId: string
  pin: string
  onDone: () => void
}

function BiometricOffer({ userId, pin, onDone }: BiometricOfferProps) {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const [busy, setBusy] = useState(false)

  const enable = async (): Promise<void> => {
    setBusy(true)
    await enableBiometricPin(userId, pin, tc('pin.biometricPrompt')).catch(() => false)
    onDone()
  }

  return (
    <Screen contentStyle={styles.content}>
      <StepDots step={2} total={3} label={t('onboarding.step', { step: 2, total: 3 })} />
      <View style={styles.badge}>
        <Ionicons name="finger-print" size={56} color={color.teamA} />
      </View>
      <Stack gap={space.sm}>
        <Text variant="display" accessibilityRole="header">
          {t('pinSetup.biometricTitle')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('pinSetup.biometricBody')}
        </Text>
      </Stack>
      <Stack gap={space.md}>
        <Button label={t('pinSetup.biometricEnable')} size="lg" block loading={busy} onPress={() => void enable()} />
        <Button label={t('pinSetup.biometricSkip')} variant="quiet" block disabled={busy} onPress={onDone} />
      </Stack>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl },
  badge: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    backgroundColor: color.teamASoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
})
