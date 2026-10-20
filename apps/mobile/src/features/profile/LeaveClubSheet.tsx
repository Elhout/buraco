import { useMutation } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, Stack, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { type MyClub, useClubs } from '@/features/clubs/ClubProvider'
import { useClubErrorText } from '@/features/clubs/screens/useClubErrorText'
import { supabase } from '@/lib/supabase'
import { color, space } from '@/theme/tokens'

export interface LeaveClubSheetProps {
  club: MyClub | null
  onClose: () => void
}

/**
 * Leaving deletes my membership (RLS allows it for non-owners). An owner must hand the club to
 * someone first. Leaving the last club sends the root guard back to club setup.
 */
export function LeaveClubSheet({ club, onClose }: LeaveClubSheetProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const userId = useUserId()
  const { refresh, current, select } = useClubs()
  const errorText = useClubErrorText()
  const isOwner = club?.role === 'owner'

  const leave = useMutation({
    mutationFn: async (target: MyClub) => {
      const { error } = await supabase.from('club_members').delete().eq('club_id', target.club.id).eq('user_id', userId)
      if (error) throw error
      await refresh()
    },
    onSuccess: () => close(),
  })

  const close = (): void => {
    leave.reset()
    onClose()
  }

  const openSettings = (): void => {
    if (club && current?.club.id !== club.club.id) select(club.club.id)
    close()
    router.push('/club/settings')
  }

  const name = club?.club.name ?? ''
  return (
    <Sheet
      visible={club !== null}
      onClose={close}
      title={isOwner ? t('clubs.ownerCantLeaveTitle') : t('clubs.leaveTitle', { club: name })}
      subtitle={isOwner ? t('clubs.ownerCantLeaveBody', { club: name }) : t('clubs.leaveBody')}
      locked={leave.isPending}>
      <Stack gap={space.md}>
        {leave.error ? (
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(leave.error)}
          </Text>
        ) : null}
        {isOwner ? (
          <Button label={t('clubs.openSettings')} block onPress={openSettings} />
        ) : (
          <Button
            label={t('clubs.leaveConfirm')}
            variant="danger"
            block
            loading={leave.isPending}
            onPress={() => club && leave.mutate(club)}
          />
        )}
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={leave.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}
