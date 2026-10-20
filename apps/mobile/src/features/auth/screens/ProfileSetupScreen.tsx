import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Button, Card, ErrorText, Field, Screen, Stack, Text } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import i18n, { type Lang, setLanguage } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { color, space } from '@/theme/tokens'
import { NAME_MAX, prefillName, validateDisplayName } from '../validation'
import { LanguageToggle } from './LanguageToggle'
import { StepDots } from './StepDots'

/**
 * Onboarding step 1: name, language and the initials avatar. Saving sets onboarded_at; the
 * session stage then moves to the PIN step (or straight into the app if a PIN already exists).
 * Photo avatars need Supabase Storage, which isn't set up yet, so the avatar is initials only.
 */
export function ProfileSetupScreen() {
  const { t } = useTranslation('auth')
  const { userId, session, profile, refreshProfile } = useSession()
  const [name, setName] = useState(() => prefillName(session?.user.user_metadata, profile?.display_name))
  const [lang, setLang] = useState<Lang>(i18n.language as Lang)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const check = validateDisplayName(name)
  const nameError = touched && !check.ok ? t(`profileSetup.name_${check.problem}`, { max: NAME_MAX }) : null

  const save = async (): Promise<void> => {
    setTouched(true)
    if (!check.ok || !userId) return
    setSaving(true)
    setError(null)
    const { error: failure } = await supabase
      .from('profiles')
      .update({ display_name: check.name, lang, onboarded_at: new Date().toISOString() })
      .eq('id', userId)
    if (failure) {
      setSaving(false)
      setError(failure)
      return
    }
    // A direction change reloads the app; on restart the stage already points at the PIN step.
    await setLanguage(lang)
    await refreshProfile()
  }

  return (
    <Screen contentStyle={styles.content}>
      <StepDots step={1} total={3} label={t('onboarding.step', { step: 1, total: 3 })} />
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('profileSetup.title')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('profileSetup.subtitle')}
        </Text>
      </Stack>
      <Card tone="raised" style={styles.preview}>
        <Avatar name={check.ok ? check.name : '?'} size={88} ring={color.teamA} />
        <View style={styles.previewText}>
          <Text variant="title" numberOfLines={1}>
            {check.ok ? check.name : t('profileSetup.namePreview')}
          </Text>
          <Text variant="caption" tone={color.inkFaint}>
            {t('profileSetup.avatarNote')}
          </Text>
        </View>
      </Card>
      <Field
        label={t('profileSetup.nameLabel')}
        value={name}
        onChangeText={setName}
        onBlur={() => setTouched(true)}
        placeholder={t('profileSetup.namePlaceholder')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={NAME_MAX + 10}
        returnKeyType="done"
        error={nameError}
        hint={t('profileSetup.nameHint')}
      />
      <Stack gap={space.xs}>
        <Text variant="label" tone={color.inkMuted}>
          {t('profileSetup.languageLabel')}
        </Text>
        <LanguageToggle value={lang} onChange={setLang} />
      </Stack>
      <ErrorText error={error} />
      <Button label={t('profileSetup.save')} size="lg" block loading={saving} onPress={() => void save()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  previewText: { flex: 1, gap: space.xs },
})
