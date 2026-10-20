import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Button, Screen, Stack, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { BackButton } from '@/features/auth/screens/BackButton'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubAccounts } from '@/features/clubs/accounts'
import { useClubMembers } from '@/features/clubs/members'
import { MemberSheet } from '@/features/clubs/screens/MemberSheet'
import { RoleChip } from '@/features/clubs/screens/RoleChip'
import { hasAnyAction, memberActions } from '@/features/clubs/screens/memberActions'
import { MeTab } from '@/features/stats/MeTab'
import { useStatsLive } from '@/features/stats/api'
import { color, space } from '@/theme/tokens'

/** /player/[id]: one player's stats in the club; owners and admins can manage the account here. */
export default function PlayerScreen() {
  const { t } = useTranslation('players')
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useUserId()
  const current = useCurrentClub()
  const { members, nameOf } = useClubMembers(current.club.id)
  const isAdmin = current.role === 'owner' || current.role === 'admin'
  const accounts = useClubAccounts(current.club.id, isAdmin)
  const [managing, setManaging] = useState(false)
  useStatsLive(current.club.id)

  const member = members.find((m) => m.userId === id) ?? null
  if (!id) return <Redirect href="/players" />
  const account = accounts.accountOf(id)
  const actions = member ? memberActions(current.role, me, member) : memberActions('member', me, { userId: me, role: 'member' })
  const canManage = hasAnyAction(actions) || (account?.canManage ?? false)

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton label={t('back')} fallback="/players" />
      </View>
      <View style={styles.identity}>
        <Avatar name={member?.name ?? ''} url={member?.avatarUrl} size={72} />
        <Stack gap={space.xs} style={styles.flex}>
          <Text variant="display" numberOfLines={2}>
            {member?.name ?? ''}
          </Text>
          <View style={styles.meta}>
            {member && member.role !== 'member' ? <RoleChip role={member.role} /> : null}
            {account?.username ? (
              <Text variant="label" tone={color.inkMuted}>
                {t('username', { username: account.username })}
              </Text>
            ) : null}
          </View>
        </Stack>
      </View>
      {canManage && member ? <Button label={t('manage')} variant="secondary" block onPress={() => setManaging(true)} /> : null}
      <MeTab clubId={current.club.id} me={id} nameOf={nameOf} />
      <MemberSheet
        clubId={current.club.id}
        member={managing ? member : null}
        actions={actions}
        canSetPassword={account?.canManage ?? false}
        onClose={() => setManaging(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
})
