import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Sheet, Stack, Text } from '@/components/ui'
import { useClubs } from '@/features/clubs/ClubProvider'
import type { Member } from '@/features/clubs/members'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { color, space } from '@/theme/tokens'
import type { MemberActions } from './memberActions'
import { SetPasswordForm } from './SetPasswordForm'
import { useClubErrorText } from './useClubErrorText'

type Action = 'promote' | 'demote' | 'transfer' | 'remove'

export interface MemberSheetProps {
  clubId: string
  member: Member | null
  actions: MemberActions
  /** Owner/admin may set this member's password (club_accounts.can_manage). */
  canSetPassword: boolean
  /** Their sign-in username, shown with the new password (name-only players get a generated one). */
  username?: string | null
  onClose: () => void
}

/** Role changes, removal and new passwords. Transfer and remove ask once more before running. */
export function MemberSheet({ clubId, member, actions, canSetPassword, username, onClose }: MemberSheetProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const client = useQueryClient()
  const { refresh } = useClubs()
  const errorText = useClubErrorText()
  const [confirming, setConfirming] = useState<'transfer' | 'remove' | null>(null)
  const [settingPassword, setSettingPassword] = useState(false)

  const run = useMutation({
    mutationFn: async (action: Action) => {
      if (!member) return
      const ids = { p_club_id: clubId, p_user_id: member.userId }
      if (action === 'promote') await rpc('set_member_role', { ...ids, p_role: 'admin' })
      else if (action === 'demote') await rpc('set_member_role', { ...ids, p_role: 'member' })
      else if (action === 'transfer') await rpc('transfer_ownership', ids)
      else await rpc('remove_member', ids)
      await client.invalidateQueries({ queryKey: qk.members(clubId) })
      if (action === 'transfer') await refresh()
    },
    onSuccess: () => close(),
  })

  const close = (): void => {
    setConfirming(null)
    setSettingPassword(false)
    run.reset()
    onClose()
  }

  const name = member?.name ?? ''
  const title = settingPassword ? t('accounts.resetTitle', { name }) : confirming ? t(`members.${confirming}Title`, { name }) : name
  const subtitle = settingPassword
    ? username
      ? t('accounts.resetSubtitleUsername', { username })
      : t('accounts.resetSubtitle')
    : confirming
      ? t(`members.${confirming}Body`, { name })
      : t(`roles.${member?.role ?? 'member'}`)

  if (settingPassword && member) {
    return (
      <Sheet visible onClose={close} title={title} subtitle={subtitle}>
        <SetPasswordForm clubId={clubId} userId={member.userId} onDone={close} onCancel={() => setSettingPassword(false)} />
      </Sheet>
    )
  }

  return (
    <Sheet visible={member !== null} onClose={close} title={title} subtitle={subtitle} locked={run.isPending}>
      {!confirming && member ? <Avatar name={member.name} url={member.avatarUrl} size={64} /> : null}
      <Stack gap={space.md}>
        {run.error ? (
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(run.error)}
          </Text>
        ) : null}
        {confirming ? (
          <Button
            label={t(`members.${confirming}Confirm`, { name })}
            variant="danger"
            block
            loading={run.isPending}
            onPress={() => run.mutate(confirming)}
          />
        ) : (
          <>
            {canSetPassword ? (
              <Button
                label={t('accounts.resetPassword')}
                variant="secondary"
                block
                disabled={run.isPending}
                onPress={() => setSettingPassword(true)}
              />
            ) : null}
            <ActionButtons actions={actions} busy={run.isPending} onRun={(a) => run.mutate(a)} onConfirm={setConfirming} />
          </>
        )}
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={run.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}

interface ActionButtonsProps {
  actions: MemberActions
  busy: boolean
  onRun: (action: 'promote' | 'demote') => void
  onConfirm: (action: 'transfer' | 'remove') => void
}

function ActionButtons({ actions, busy, onRun, onConfirm }: ActionButtonsProps) {
  const { t } = useTranslation('profile')
  return (
    <>
      {actions.promote ? (
        <Button label={t('members.promote')} variant="secondary" block loading={busy} onPress={() => onRun('promote')} />
      ) : null}
      {actions.demote ? (
        <Button label={t('members.demote')} variant="secondary" block loading={busy} onPress={() => onRun('demote')} />
      ) : null}
      {actions.transfer ? (
        <Button label={t('members.transfer')} variant="secondary" block disabled={busy} onPress={() => onConfirm('transfer')} />
      ) : null}
      {actions.remove ? (
        <Button label={t('members.remove')} variant="danger" block disabled={busy} onPress={() => onConfirm('remove')} />
      ) : null}
    </>
  )
}
