import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Sheet, Stack, Text } from '@/components/ui'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { NAME_MAX, validateDisplayName } from '@/features/auth/validation'
import { manageAccount } from '@/features/clubs/accounts'
import { qk } from '@/lib/queryKeys'
import { color, space } from '@/theme/tokens'

export interface AddPlayerSheetProps {
  clubId: string
  visible: boolean
  onClose: () => void
  /** Called with the new player, e.g. to seat them straight away on New game. */
  onCreated?: (player: { userId: string; name: string }) => void
}

/**
 * New player: just a name. The server makes the account with a password nobody sees, so the
 * player can't sign in; an admin can turn that on later (Manage player → Set a new password).
 */
export function AddPlayerSheet({ clubId, visible, onClose, onCreated }: AddPlayerSheetProps) {
  const { t } = useTranslation('profile')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const client = useQueryClient()
  const errorText = useAuthErrorText()
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const check = validateDisplayName(name)
  const nameError = touched && !check.ok ? ta(`profileSetup.name_${check.problem}`, { max: NAME_MAX }) : null

  const close = (): void => {
    setName('')
    setTouched(false)
    create.reset()
    onClose()
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!check.ok) return
      const { user_id } = await manageAccount({ action: 'create', club_id: clubId, display_name: check.name })
      await client.invalidateQueries({ queryKey: qk.members(clubId) })
      if (user_id) onCreated?.({ userId: user_id, name: check.name })
    },
    onSuccess: close,
  })

  const submit = (): void => {
    setTouched(true)
    if (check.ok && !create.isPending) create.mutate()
  }

  return (
    <Sheet visible={visible} onClose={close} title={t('accounts.addTitle')} subtitle={t('accounts.addSubtitle')} locked={create.isPending}>
      <Stack gap={space.md}>
        <Field
          label={t('accounts.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
          error={nameError}
        />
        {create.error ? (
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(create.error)}
          </Text>
        ) : null}
        <Button label={t('accounts.create')} size="lg" block loading={create.isPending} onPress={submit} />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={create.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}
