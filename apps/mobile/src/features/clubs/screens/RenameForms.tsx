import { validateUsername } from '@buraco/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Stack, Text } from '@/components/ui'
import { NAME_MAX, validateDisplayName } from '@/features/auth/validation'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { manageAccount } from '@/features/clubs/accounts'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { color, space } from '@/theme/tokens'
import { useClubErrorText } from './useClubErrorText'

interface RenameFormProps {
  clubId: string
  userId: string
  /** What it is now, to start from. */
  current: string
  onDone: () => void
  onCancel: () => void
}

/** Owner only: the player's display name (set_member_name). */
export function NameForm({ clubId, userId, current, onDone, onCancel }: RenameFormProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const errorText = useClubErrorText()
  const client = useQueryClient()
  const [name, setName] = useState(current)
  const check = validateDisplayName(name)
  const save = useMutation({
    mutationFn: async () => {
      if (!check.ok) return
      await rpc('set_member_name', { p_club_id: clubId, p_user_id: userId, p_name: check.name })
      await client.invalidateQueries({ queryKey: qk.members(clubId) })
      await client.invalidateQueries({ queryKey: qk.me(userId) })
    },
    onSuccess: onDone,
  })
  return (
    <Stack gap={space.md}>
      <Field
        label={t('identity.name')}
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX + 10}
        autoCapitalize="words"
        error={check.ok ? null : t(`identity.name_${check.problem}`, { max: NAME_MAX })}
      />
      {save.error ? (
        <Text variant="label" tone={color.danger} accessibilityRole="alert">
          {errorText(save.error)}
        </Text>
      ) : null}
      <Button label={t('rename.saveName')} size="lg" block loading={save.isPending} disabled={!check.ok} onPress={() => save.mutate()} />
      <Button label={tc('actions.cancel')} variant="quiet" block disabled={save.isPending} onPress={onCancel} />
    </Stack>
  )
}

/** Owner only: the login name (manage-accounts set_username). The password stays the same. */
export function UsernameForm({ clubId, userId, current, onDone, onCancel }: RenameFormProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const errorText = useAuthErrorText()
  const client = useQueryClient()
  const [username, setUsername] = useState(current)
  const check = validateUsername(username)
  const save = useMutation({
    mutationFn: async () => {
      if (!check.ok) return
      await manageAccount({ action: 'set_username', club_id: clubId, user_id: userId, username: check.username })
      await client.invalidateQueries({ queryKey: qk.accounts(clubId) })
    },
    onSuccess: onDone,
  })
  return (
    <Stack gap={space.md}>
      <Field
        label={t('rename.usernameLabel')}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        hint={t('rename.usernameHint')}
        error={username.trim() === '' || check.ok ? null : t(`accounts.username_${check.problem}`)}
      />
      {save.error ? (
        <Text variant="label" tone={color.danger} accessibilityRole="alert">
          {errorText(save.error)}
        </Text>
      ) : null}
      <Button
        label={t('rename.saveUsername')}
        size="lg"
        block
        loading={save.isPending}
        disabled={!check.ok}
        onPress={() => save.mutate()}
      />
      <Button label={tc('actions.cancel')} variant="quiet" block disabled={save.isPending} onPress={onCancel} />
    </Stack>
  )
}
