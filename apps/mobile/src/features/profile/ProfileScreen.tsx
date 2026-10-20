import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Screen, Text } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { BackButton } from '@/features/auth/screens/BackButton'
import { color, space } from '@/theme/tokens'
import { AccountSection } from './AccountSection'
import { AppearanceSection } from './AppearanceSection'
import { DevicesSection } from './DevicesSection'
import { IdentitySection } from './IdentitySection'
import { MyClubsSection } from './MyClubsSection'
import { NotificationsSection } from './NotificationsSection'
import { PinSection } from './PinSection'

/**
 * /profile. Other screens can open the PIN reset directly with /profile?resetPin=1
 * (e.g. from the PIN sheet's "Forgot PIN?").
 */
export function ProfileScreen() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { profile, refreshProfile } = useSession()
  const { resetPin } = useLocalSearchParams<{ resetPin?: string }>()

  return (
    <Screen onRefresh={() => void refreshProfile()} refreshing={false}>
      <View style={styles.header}>
        <BackButton label={t('back')} fallback="/club" />
        <Text variant="title" accessibilityRole="header">
          {t('title')}
        </Text>
      </View>
      {profile ? (
        <>
          <IdentitySection key={profile.id} profile={profile} />
          <PinSection startReset={resetPin === '1'} />
          <MyClubsSection />
          <AppearanceSection />
          <NotificationsSection profile={profile} />
          <DevicesSection />
          <AccountSection />
        </>
      ) : (
        <ActivityIndicator color={color.ink} accessibilityLabel={tc('loading')} />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
