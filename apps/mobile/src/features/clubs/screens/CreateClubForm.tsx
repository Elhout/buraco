import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ErrorText, Field, Stack, Text } from '@/components/ui'
import { color, space } from '@/theme/tokens'
import { CLUB_NAME_MAX, validateClubName } from './settingsForm'
import { useCreateClub } from './useClubActions'

export interface CreateClubFormProps {
  onCreated: (clubId: string) => void
}

/** You become the owner; the club starts with the house rules (2000 target, +100 cut). */
export function CreateClubForm({ onCreated }: CreateClubFormProps) {
  const { t } = useTranslation('auth')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const create = useCreateClub(onCreated)
  const problem = validateClubName(name)

  const submit = (): void => {
    setTouched(true)
    if (problem === null && !create.isPending) create.mutate(name.trim())
  }

  return (
    <Stack gap={space.lg}>
      <Field
        label={t('club.nameLabel')}
        value={name}
        onChangeText={(v) => {
          setName(v)
          create.reset()
        }}
        onBlur={() => setTouched(true)}
        placeholder={t('club.namePlaceholder')}
        autoCapitalize="words"
        maxLength={CLUB_NAME_MAX + 5}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={touched && problem ? t(`club.name_${problem}`, { max: CLUB_NAME_MAX }) : null}
      />
      <Text variant="caption" tone={color.inkFaint}>
        {t('club.createNote')}
      </Text>
      <ErrorText error={create.error} />
      <Button label={t('club.create')} size="lg" block loading={create.isPending} onPress={submit} />
    </Stack>
  )
}
