import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Avatar, Button, Card, EmptyState, ListRow, SectionTitle, Stack, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import type { MyClub } from '@/features/clubs/ClubProvider'
import { useClubAccounts } from '@/features/clubs/accounts'
import { type Member, useClubMembers } from '@/features/clubs/members'
import i18n from '@/i18n'
import { formatDate, formatNumber } from '@/lib/format'
import { color, space } from '@/theme/tokens'
import { AddPlayerSheet } from './AddPlayerSheet'
import { MemberSheet } from './MemberSheet'
import { hasAnyAction, memberActions, sortMembers } from './memberActions'
import { RoleChip } from './RoleChip'
import { useClubErrorText } from './useClubErrorText'

/**
 * Live member list with role chips; tapping a member opens what I'm allowed to do. Owners and
 * admins also see usernames, add players and set new passwords.
 */
export function MembersSection({ current }: { current: MyClub }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const me = useUserId()
  const errorText = useClubErrorText()
  const query = useClubMembers(current.club.id)
  const [selected, setSelected] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const isAdmin = current.role === 'owner' || current.role === 'admin'
  const accounts = useClubAccounts(current.club.id, isAdmin)
  const actionsFor = (m: Member) => memberActions(current.role, me, m)

  const body = (() => {
    if (query.isPending) return <ActivityIndicator color={color.ink} accessibilityLabel={tc('loading')} />
    if (query.isError) {
      return (
        <Stack gap={space.sm}>
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(query.error)}
          </Text>
          <Button label={tc('actions.retry')} variant="secondary" onPress={() => void query.refetch()} />
        </Stack>
      )
    }
    if (query.members.length === 0) return <EmptyState icon="people-outline" title={t('members.empty')} />
    return sortMembers(query.members, i18n.language).map((m) => {
      const account = accounts.accountOf(m.userId)
      const allowed = hasAnyAction(actionsFor(m)) || (account?.canManage ?? false)
      const joined = t('members.joined', { date: formatDate(m.joinedAt, i18n.language) })
      return (
        <ListRow
          key={m.userId}
          title={m.userId === me ? t('members.you', { name: m.name }) : m.name}
          subtitle={account?.username ? `${t('accounts.username', { username: account.username })} · ${joined}` : joined}
          leading={<Avatar name={m.name} url={m.avatarUrl} size={40} />}
          trailing={<RoleChip role={m.role} />}
          onPress={allowed ? () => setSelected(m) : undefined}
        />
      )
    })
  })()

  return (
    <Stack gap={space.sm}>
      <SectionTitle>{t('members.title', { count: query.members.length, n: formatNumber(query.members.length) })}</SectionTitle>
      <Card style={{ gap: space.xs }}>{body}</Card>
      {isAdmin ? <Button label={t('accounts.add')} variant="secondary" block onPress={() => setAdding(true)} /> : null}
      {isAdmin ? <AddPlayerSheet clubId={current.club.id} visible={adding} onClose={() => setAdding(false)} /> : null}
      <MemberSheet
        clubId={current.club.id}
        member={selected}
        actions={selected ? actionsFor(selected) : memberActions('member', me, { userId: me, role: 'member' })}
        canSetPassword={selected ? (accounts.accountOf(selected.userId)?.canManage ?? false) : false}
        onClose={() => setSelected(null)}
      />
    </Stack>
  )
}
