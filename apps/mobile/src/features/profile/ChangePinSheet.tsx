import { useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, useErrorText } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { PinPad } from '@/features/auth/screens/PinPad'
import { usePinChooser } from '@/features/auth/screens/usePinChooser'
import { rpcWithPin } from '@/lib/rpc'
import { forgetStoredPin } from './biometric'
import { usePinFailureText } from './pinMessages'

export interface ChangePinSheetProps {
  visible: boolean
  onClose: () => void
  onForgot: () => void
}

/** Current PIN → new PIN → repeat, then change_pin checks the current one server-side. */
export function ChangePinSheet({ visible, onClose, onForgot }: ChangePinSheetProps) {
  const { t } = useTranslation('profile')
  const userId = useUserId()
  const client = useQueryClient()
  const chooser = usePinChooser(true)
  const errorText = useErrorText()
  const failureText = usePinFailureText()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const close = (): void => {
    chooser.reset(true)
    setMessage(null)
    onClose()
  }

  const submit = async (current: string, next: string): Promise<void> => {
    setBusy(true)
    try {
      const result = await rpcWithPin('change_pin', { p_old_pin: current, p_new_pin: next })
      if (result.ok) {
        await forgetStoredPin(userId, client)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        close()
        return
      }
      setMessage({ text: failureText(result), error: true })
    } catch (failure) {
      setMessage({ text: errorText(failure), error: true })
    } finally {
      setBusy(false)
    }
    chooser.reset(true)
  }

  const onDigit = (d: string): void => {
    setMessage(null)
    const current = chooser.draft.current
    const pin = chooser.onDigit(d)
    if (pin) void submit(current, pin)
  }

  const shown = message ?? (chooser.hint ? { text: chooser.hint, error: true } : null)

  return (
    <Sheet visible={visible} onClose={close} title={t('pin.changeTitle')} locked={busy}>
      <PinPad
        entry={chooser.draft.entry}
        prompt={chooser.prompt}
        message={shown?.text ?? null}
        error={shown?.error}
        disabled={busy}
        onDigit={onDigit}
        onDelete={chooser.onDelete}
      />
      <Button
        label={t('pin.forgot')}
        variant="quiet"
        disabled={busy}
        onPress={() => {
          close()
          onForgot()
        }}
      />
    </Sheet>
  )
}
