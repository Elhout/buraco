import { Ionicons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Field, Sheet, Stack, Text, useErrorText } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { supabase } from '@/lib/supabase'
import { color, space } from '@/theme/tokens'
import { isDeleteConfirmed } from './deleteConfirm'

export interface DeleteAccountSheetProps {
  visible: boolean
  onClose: () => void
}

const CONSEQUENCES = ['profile', 'history', 'clubs', 'games'] as const

/**
 * Permanent deletion through the delete-account Edge Function (it reads the user from the JWT,
 * anonymizes past games and deletes the auth user). Typing the word unlocks the button.
 */
export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { signOut } = useSession()
  const errorText = useErrorText()
  const [typed, setTyped] = useState('')

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
      if (error) throw error
      await signOut()
    },
  })

  const close = (): void => {
    setTyped('')
    remove.reset()
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={close} title={t('delete.title')} subtitle={t('delete.subtitle')} locked={remove.isPending}>
      <Stack gap={space.sm}>
        {CONSEQUENCES.map((key) => (
          <View key={key} style={styles.item}>
            <Ionicons name="remove-circle-outline" size={18} color={color.danger} style={styles.icon} />
            <Text variant="body" tone={color.inkMuted} style={styles.flex}>
              {t(`delete.${key}`)}
            </Text>
          </View>
        ))}
      </Stack>
      <Field
        label={t('delete.typeLabel', { word: t('delete.word') })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder={t('delete.word')}
        error={remove.error ? errorText(remove.error) : null}
      />
      <Stack gap={space.md}>
        <Button
          label={t('delete.confirm')}
          variant="danger"
          block
          disabled={!isDeleteConfirmed(typed)}
          loading={remove.isPending}
          onPress={() => remove.mutate()}
        />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={remove.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  icon: { marginTop: 3 },
  flex: { flex: 1 },
})
