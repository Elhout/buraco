import { validatePassword, validateUsername } from '@buraco/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { Button, Card, Field, Sheet, Stack, Text } from '@/components/ui'
import { PasswordField } from '@/features/auth/screens/PasswordField'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { NAME_MAX, validateDisplayName } from '@/features/auth/validation'
import { manageAccount } from '@/features/clubs/accounts'
import { suggestUsername } from '@/features/clubs/usernameSuggestion'
import { qk } from '@/lib/queryKeys'
import { color, space } from '@/theme/tokens'

export interface AddPlayerSheetProps {
  clubId: string
  visible: boolean
  onClose: () => void
  /** Called with the new account, e.g. to seat the player straight away on New game. */
  onCreated?: (player: { userId: string; name: string }) => void
}

interface Created {
  name: string
  username: string
  password: string
}

/** Owners and admins create a player's login; the new account joins this club straight away. */
export function AddPlayerSheet({ clubId, visible, onClose, onCreated }: AddPlayerSheetProps) {
  const { t } = useTranslation('profile')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const client = useQueryClient()
  const errorText = useAuthErrorText()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  // Follows the name until the admin edits the username themselves.
  const [usernameEdited, setUsernameEdited] = useState(false)
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)

  const nameCheck = validateDisplayName(name)
  const userCheck = validateUsername(username)
  const passCheck = validatePassword(password)
  const nameError = touched && !nameCheck.ok ? ta(`profileSetup.name_${nameCheck.problem}`, { max: NAME_MAX }) : null
  const userError = touched && !userCheck.ok ? t(`accounts.username_${userCheck.problem}`) : null
  const passError = touched && !passCheck.ok ? t(`accounts.password_${passCheck.problem}`) : null

  const create = useMutation({
    mutationFn: async () => {
      if (!nameCheck.ok || !userCheck.ok || !passCheck.ok) return
      const { user_id } = await manageAccount({
        action: 'create',
        club_id: clubId,
        username: userCheck.username,
        password,
        display_name: nameCheck.name,
      })
      if (user_id) onCreated?.({ userId: user_id, name: nameCheck.name })
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.members(clubId) }),
        client.invalidateQueries({ queryKey: qk.accounts(clubId) }),
      ])
      setCreated({ name: nameCheck.name, username: userCheck.username, password })
    },
  })

  const close = (): void => {
    setName('')
    setUsername('')
    setUsernameEdited(false)
    setPassword('')
    setTouched(false)
    setCreated(null)
    create.reset()
    onClose()
  }

  const submit = (): void => {
    setTouched(true)
    if (nameCheck.ok && userCheck.ok && passCheck.ok) create.mutate()
  }

  if (created) {
    return (
      <Sheet
        visible={visible}
        onClose={close}
        title={t('accounts.createdTitle')}
        subtitle={t('accounts.createdBody', { name: created.name })}>
        <Stack gap={space.md}>
          <Card style={styles.details}>
            <Text variant="title" selectable style={styles.ltr}>
              {t('accounts.username', { username: created.username })}
            </Text>
            <Text variant="title" selectable style={styles.ltr}>
              {`${t('accounts.passwordLabel')}: ${created.password}`}
            </Text>
          </Card>
          <Button label={t('accounts.done')} size="lg" block onPress={close} />
        </Stack>
      </Sheet>
    )
  }

  return (
    <Sheet visible={visible} onClose={close} title={t('accounts.addTitle')} subtitle={t('accounts.addSubtitle')} locked={create.isPending}>
      <Stack gap={space.md}>
        <Field
          label={t('accounts.nameLabel')}
          value={name}
          onChangeText={(v) => {
            setName(v)
            if (!usernameEdited) setUsername(suggestUsername(v))
          }}
          maxLength={NAME_MAX}
          error={nameError}
        />
        <Field
          label={t('accounts.usernameLabel')}
          value={username}
          onChangeText={(v) => {
            setUsername(v)
            setUsernameEdited(true)
          }}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          hint={t('accounts.usernameHint')}
          error={userError}
          style={styles.ltr}
        />
        <PasswordField
          label={t('accounts.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
          autoComplete="new-password"
          hint={t('accounts.passwordHint')}
          error={passError}
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

const styles = StyleSheet.create({
  details: { gap: space.sm },
  ltr: { writingDirection: 'ltr' },
})
