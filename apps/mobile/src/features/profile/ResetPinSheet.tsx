import { useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, Stack } from '@/components/ui'
import { useSession, useUserId } from '@/features/auth/SessionProvider'
import { PasswordField } from '@/features/auth/screens/PasswordField'
import { PinPad } from '@/features/auth/screens/PinPad'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { usePinChooser } from '@/features/auth/screens/usePinChooser'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import { space } from '@/theme/tokens'
import { forgetStoredPin } from './biometric'

/** Server window for reset_pin after a fresh sign-in (recently_authenticated). */
const REAUTH_WINDOW_MS = 10 * 60_000

type Step = { kind: 'password' } | { kind: 'choose'; reauthAt: number }

export interface ResetPinSheetProps {
  visible: boolean
  onClose: () => void
}

/**
 * Forgotten PIN: re-enter the account password (a fresh sign-in), then choose a new PIN.
 * reset_pin is accepted for 10 minutes after that sign-in and also clears a lockout.
 */
export function ResetPinSheet({ visible, onClose }: ResetPinSheetProps) {
  const { t } = useTranslation('profile')
  const { session } = useSession()
  const userId = useUserId()
  const client = useQueryClient()
  const errorText = useAuthErrorText()
  const chooser = usePinChooser(false)
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = (): void => {
    setStep({ kind: 'password' })
    setPassword('')
    setError(null)
    chooser.reset(false)
    onClose()
  }

  const confirmPassword = async (): Promise<void> => {
    const email = session?.user.email
    if (!email || password.length === 0) return
    setBusy(true)
    setError(null)
    const { data, error: failure } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    setPassword('')
    if (failure || data.user?.id !== userId) {
      setError(errorText(failure ?? new Error('Invalid login credentials')))
      return
    }
    setStep({ kind: 'choose', reauthAt: Date.now() })
  }

  const save = async (pin: string, reauthAt: number): Promise<void> => {
    if (Date.now() - reauthAt >= REAUTH_WINDOW_MS) {
      setStep({ kind: 'password' })
      setError(t('pin.reauthExpired'))
      return
    }
    setBusy(true)
    try {
      await rpc('reset_pin', { p_pin: pin })
      await forgetStoredPin(userId, client)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      close()
    } catch (failure) {
      setError(errorText(failure))
      chooser.reset(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('pin.resetTitle')}
      subtitle={step.kind === 'choose' ? t('pin.resetChoose') : t('pin.resetIntro')}
      locked={busy}>
      {step.kind === 'password' ? (
        <Stack gap={space.md}>
          <PasswordField
            label={t('pin.resetPasswordLabel')}
            value={password}
            onChangeText={(v) => {
              setPassword(v)
              setError(null)
            }}
            returnKeyType="go"
            onSubmitEditing={() => void confirmPassword()}
            error={error}
          />
          <Button
            label={t('pin.resetConfirm')}
            size="lg"
            block
            loading={busy}
            disabled={password.length === 0}
            onPress={() => void confirmPassword()}
          />
        </Stack>
      ) : (
        <PinPad
          entry={chooser.draft.entry}
          prompt={chooser.prompt}
          message={error ?? chooser.hint}
          error={error !== null || chooser.hint !== null}
          disabled={busy}
          onDigit={(d) => {
            setError(null)
            const pin = chooser.onDigit(d)
            if (pin) void save(pin, step.reauthAt)
          }}
          onDelete={chooser.onDelete}
        />
      )}
    </Sheet>
  )
}
