import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Card, EmptyState, Screen, Stack, Text } from '@/components/ui'
import { BackButton, goBackOr } from '@/features/auth/screens/BackButton'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { useClubs } from '@/features/clubs/ClubProvider'
import { color, font, space } from '@/theme/tokens'
import { parseInviteCode, spacedCode } from './inviteCode'
import { useJoinClub } from './useClubActions'

/**
 * buraco://join/<CODE> from a club QR or a shared link. Clubs can't be read before joining
 * (RLS), so we confirm the code itself; the club name shows once joined.
 */
export function JoinLinkScreen() {
  const { t } = useTranslation('auth')
  const { code: raw } = useLocalSearchParams<{ code?: string }>()
  const code = parseInviteCode(raw ?? '')
  const { clubs, select } = useClubs()
  const existing = code ? clubs.find((c) => c.club.invite_code === code) : undefined

  const open = (clubId: string): void => {
    select(clubId)
    router.replace('/club')
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton label={t('club.close')} fallback="/" icon="close" />
      </View>
      {!code ? (
        <EmptyState
          icon="link-outline"
          title={t('club.linkInvalidTitle')}
          body={t('club.linkInvalidBody')}
          action={<Button label={t('club.close')} variant="secondary" onPress={() => goBackOr('/')} />}
        />
      ) : existing ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('club.alreadyMember', { club: existing.club.name })}
          action={<Button label={t('club.openClub')} onPress={() => open(existing.club.id)} />}
        />
      ) : (
        <JoinConfirm code={code} onJoined={open} />
      )}
    </Screen>
  )
}

function JoinConfirm({ code, onJoined }: { code: string; onJoined: (clubId: string) => void }) {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const errorText = useAuthErrorText()
  const join = useJoinClub(onJoined)
  return (
    <Stack gap={space.xl}>
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('club.linkTitle')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('club.linkBody')}
        </Text>
      </Stack>
      <Card tone="raised" accent={color.teamB} style={styles.codeCard}>
        <Text variant="caption" tone={color.inkMuted} center>
          {t('club.codeLabel')}
        </Text>
        <Text variant="scoreXl" center style={styles.code} accessibilityLabel={[...code].join(' ')}>
          {spacedCode(code)}
        </Text>
      </Card>
      {join.error ? (
        <Text variant="label" tone={color.danger} accessibilityRole="alert">
          {errorText(join.error)}
        </Text>
      ) : null}
      <Stack gap={space.md}>
        <Button label={t('club.join')} size="lg" block loading={join.isPending} onPress={() => join.mutate(code)} />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={join.isPending} onPress={() => goBackOr('/')} />
      </Stack>
    </Stack>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl },
  header: { flexDirection: 'row' },
  codeCard: { alignItems: 'center', paddingVertical: space.xl },
  code: { fontFamily: font.score, letterSpacing: 6, writingDirection: 'ltr' },
})
