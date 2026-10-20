import { validatePassword } from '@buraco/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, Stack, Text } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { PasswordField } from '@/features/auth/screens/PasswordField'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { supabase } from '@/lib/supabase'
import { color, space } from '@/theme/tokens'

export interface ChangePasswordSheetProps {
  visible: boolean
  onClose: () => void
}

/** The player changes their own password: current one first (checked by signing in again), then the new one. */
export function ChangePasswordSheet({ visible, onClose }: ChangePasswordSheetProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { session } = useSession()
  const errorText = useAuthErrorText()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [touched, setTouched] = useState(false)
  const check = validatePassword(next)
  const problem = touched && !check.ok ? t(`accounts.password_${check.problem}`) : null

  const close = (): void => {
    setCurrent('')
    setNext('')
    setTouched(false)
    save.reset()
    onClose()
  }

  const save = useMutation({
    mutationFn: async () => {
      const email = session?.user.email
      if (!email) throw new Error('Invalid login credentials')
      const verified = await supabase.auth.signInWithPassword({ email, password: current })
      if (verified.error) throw verified.error
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw error
    },
    onSuccess: close,
  })

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('account.passwordTitle')}
      subtitle={t('account.passwordBody')}
      locked={save.isPending}>
      <Stack gap={space.md}>
        <PasswordField label={t('account.currentPassword')} value={current} onChangeText={setCurrent} />
        <PasswordField
          label={t('account.newPassword')}
          value={next}
          onChangeText={setNext}
          textContentType="newPassword"
          autoComplete="new-password"
          hint={t('accounts.passwordHint')}
          error={problem}
        />
        {save.error ? (
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(save.error)}
          </Text>
        ) : null}
        <Button
          label={t('accounts.save')}
          size="lg"
          block
          loading={save.isPending}
          disabled={current.length === 0}
          onPress={() => {
            setTouched(true)
            if (check.ok) save.mutate()
          }}
        />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={save.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}
