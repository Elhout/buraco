import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Screen, Stack, Text } from '@/components/ui'
import { BackButton, goBackOr } from '@/features/auth/screens/BackButton'
import { color, space } from '@/theme/tokens'
import { JoinClubForm } from './JoinClubForm'

/** /club/join: the same join UI as onboarding, as a modal for players already in a club. */
export function JoinModalScreen() {
  const { t } = useTranslation('auth')
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton label={t('club.close')} fallback="/club" icon="close" />
      </View>
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('club.joinTitle')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('club.joinSubtitle')}
        </Text>
      </Stack>
      <JoinClubForm onJoined={() => goBackOr('/club')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl },
  header: { flexDirection: 'row' },
})
