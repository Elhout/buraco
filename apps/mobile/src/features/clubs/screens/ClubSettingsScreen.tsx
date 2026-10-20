import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Screen, SectionTitle, Stack, Text } from '@/components/ui'
import { BackButton } from '@/features/auth/screens/BackButton'
import { useClubs, useCurrentClub } from '@/features/clubs/ClubProvider'
import { color, space } from '@/theme/tokens'
import { ClubConfigSection } from './ClubConfigSection'
import { InviteCard } from './InviteCard'
import { MembersSection } from './MembersSection'
import { RoleChip } from './RoleChip'

/** /club/settings for the current club: invite, scoring rules, members and roles. */
export function ClubSettingsScreen() {
  const { t } = useTranslation('profile')
  const current = useCurrentClub()
  const { refresh } = useClubs()
  const { club, role } = current
  const canEdit = role === 'owner' || role === 'admin'

  return (
    <Screen onRefresh={() => void refresh()} refreshing={false}>
      <View style={styles.header}>
        <BackButton label={t('back')} fallback="/club" />
      </View>
      <Stack gap={space.xs}>
        <Text variant="caption" tone={color.inkMuted} style={styles.kicker}>
          {t('clubSettings.kicker')}
        </Text>
        <Text variant="display" accessibilityRole="header" numberOfLines={2}>
          {club.name}
        </Text>
        <View style={styles.roleRow}>
          <Text variant="label" tone={color.inkMuted}>
            {t('clubSettings.yourRole')}
          </Text>
          <RoleChip role={role} />
        </View>
      </Stack>
      <SectionTitle>{t('clubSettings.inviteSection')}</SectionTitle>
      <InviteCard club={club} isOwner={role === 'owner'} />
      <SectionTitle>{t('clubSettings.rulesSection')}</SectionTitle>
      <ClubConfigSection club={club} canEdit={canEdit} />
      <MembersSection current={current} />
      <Text variant="caption" tone={color.inkFaint}>
        {t('clubSettings.rolesNote')}
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' },
  kicker: { textTransform: 'uppercase', letterSpacing: 1.2 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
