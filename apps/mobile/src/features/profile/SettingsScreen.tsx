import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Card, Screen, SectionTitle, Stack, Text } from '@/components/ui'
import { ThemePicker } from '@/components/ThemePicker'
import { useSession } from '@/features/auth/SessionProvider'
import { BackButton } from '@/features/auth/screens/BackButton'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { ClubConfigSection } from '@/features/clubs/screens/ClubConfigSection'
import { color, space } from '@/theme/tokens'
import { AccountSection } from './AccountSection'
import { IdentitySection } from './IdentitySection'
import { WebPushCard } from './WebPushCard'

/** /profile → Settings: you (name, language), light/dark, the house rules, and your account. */
export function SettingsScreen() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation()
  const { profile } = useSession()
  const current = useCurrentClub()
  const canEdit = current.role === 'owner' || current.role === 'admin'

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton label={t('back')} fallback="/club" />
        <Text variant="title" accessibilityRole="header">
          {t('title')}
        </Text>
      </View>
      {profile ? (
        <IdentitySection key={profile.id} profile={profile} />
      ) : (
        <ActivityIndicator color={color.ink} accessibilityLabel={tc('loading')} />
      )}
      <Stack>
        <SectionTitle>{tc('theme.section')}</SectionTitle>
        <Card>
          <ThemePicker />
        </Card>
      </Stack>
      <WebPushCard />
      <Stack>
        <SectionTitle>{t('rules')}</SectionTitle>
        <ClubConfigSection club={current.club} canEdit={canEdit} />
      </Stack>
      <AccountSection />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
