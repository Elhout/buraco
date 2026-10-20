import { validatePassword } from '@buraco/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Stack, Text } from '@/components/ui'
import { PasswordField } from '@/features/auth/screens/PasswordField'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { manageAccount } from '@/features/clubs/accounts'
import { color, space } from '@/theme/tokens'

export interface SetPasswordFormProps {
  clubId: string
  userId: string
  onDone: () => void
  onCancel: () => void
}

/** Inside the member sheet: an owner/admin sets a new password for a player who forgot theirs. */
export function SetPasswordForm({ clubId, userId, onDone, onCancel }: SetPasswordFormProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const errorText = useAuthErrorText()
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const check = validatePassword(password)
  const problem = touched && !check.ok ? t(`accounts.password_${check.problem}`) : null

  const save = useMutation({
    mutationFn: () => manageAccount({ action: 'set_password', club_id: clubId, user_id: userId, password }),
    onSuccess: onDone,
  })

  return (
    <Stack gap={space.md}>
      <PasswordField
        label={t('accounts.passwordLabel')}
        value={password}
        onChangeText={setPassword}
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
        onPress={() => {
          setTouched(true)
          if (check.ok) save.mutate()
        }}
      />
      <Button label={tc('actions.cancel')} variant="quiet" block disabled={save.isPending} onPress={onCancel} />
    </Stack>
  )
}
