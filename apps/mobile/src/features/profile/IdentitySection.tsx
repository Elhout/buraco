import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, ErrorText, Stack, Text } from '@/components/ui'
import type { Profile } from '@/features/auth/SessionProvider'
import { LanguageToggle } from '@/features/auth/screens/LanguageToggle'
import i18n, { type Lang, setLanguage } from '@/i18n'
import { color, space } from '@/theme/tokens'
import { useUpdateProfile } from './useUpdateProfile'

/** Initials avatar, name (only the club owner changes it) and language. */
export function IdentitySection({ profile }: { profile: Profile }) {
  const { t } = useTranslation('profile')
  const update = useUpdateProfile()

  const changeLanguage = (lang: Lang): void => {
    if (lang === i18n.language) return
    // Save first (onboarded_at makes the choice follow the player to other phones), then switch:
    // going between EN and AR reloads the app to mirror the layout.
    update.mutate({ lang, onboarded_at: new Date().toISOString() }, { onSuccess: () => void setLanguage(lang) })
  }

  return (
    <Card>
      <View style={styles.hero}>
        <Avatar name={profile.display_name} url={profile.avatar_url} size={72} ring={color.lineStrong} />
        <Text variant="title" numberOfLines={1} style={styles.heroText}>
          {profile.display_name}
        </Text>
      </View>
      <Text variant="caption" tone={color.inkMuted}>
        {t('identity.nameByOwner')}
      </Text>
      <Stack gap={space.xs}>
        <Text variant="label" tone={color.inkMuted}>
          {t('identity.language')}
        </Text>
        <LanguageToggle value={i18n.language === 'ar' ? 'ar' : 'en'} onChange={changeLanguage} />
      </Stack>
      <ErrorText error={update.error} />
    </Card>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroText: { flex: 1 },
})
