import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Button, Card, ErrorText, Field, Stack, Text } from '@/components/ui'
import type { Profile } from '@/features/auth/SessionProvider'
import { LanguageToggle } from '@/features/auth/screens/LanguageToggle'
import { NAME_MAX, validateDisplayName } from '@/features/auth/validation'
import { type Lang, setLanguage } from '@/i18n'
import { color, space } from '@/theme/tokens'
import { useUpdateProfile } from './useUpdateProfile'

/** Avatar (initials; photo upload waits for Storage), editable name and language. */
export function IdentitySection({ profile }: { profile: Profile }) {
  const { t } = useTranslation('profile')
  const update = useUpdateProfile()
  const [name, setName] = useState(profile.display_name)
  const check = validateDisplayName(name)
  const dirty = check.ok && check.name !== profile.display_name

  const changeLanguage = (lang: Lang): void => {
    if (lang === profile.lang) return
    // Save first: switching between EN and AR reloads the app to mirror the layout.
    update.mutate({ lang }, { onSuccess: () => void setLanguage(lang) })
  }

  return (
    <Card tone="raised">
      <View style={styles.hero}>
        <Avatar name={check.ok ? check.name : profile.display_name} url={profile.avatar_url} size={72} ring={color.teamA} />
        <View style={styles.heroText}>
          <Text variant="title" numberOfLines={1}>
            {profile.display_name}
          </Text>
          <Text variant="caption" tone={color.inkFaint}>
            {t('identity.avatarNote')}
          </Text>
        </View>
      </View>
      <Field
        label={t('identity.name')}
        value={name}
        onChangeText={(v) => {
          setName(v)
          update.reset()
        }}
        maxLength={NAME_MAX + 10}
        autoCapitalize="words"
        error={check.ok ? null : t(`identity.name_${check.problem}`, { max: NAME_MAX })}
      />
      {dirty ? (
        <Button
          label={t('identity.saveName')}
          loading={update.isPending}
          onPress={() => check.ok && update.mutate({ display_name: check.name })}
        />
      ) : null}
      <Stack gap={space.xs}>
        <Text variant="label" tone={color.inkMuted}>
          {t('identity.language')}
        </Text>
        <LanguageToggle value={profile.lang === 'ar' ? 'ar' : 'en'} onChange={changeLanguage} />
      </Stack>
      <ErrorText error={update.error} />
    </Card>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroText: { flex: 1, gap: space.xxs },
})
