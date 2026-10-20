import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, Stack, Text } from '@/components/ui'
import { useClubs } from '@/features/clubs/ClubProvider'
import { rpc } from '@/lib/rpc'
import { color, space } from '@/theme/tokens'
import { useClubErrorText } from './useClubErrorText'

export interface RotateCodeSheetProps {
  clubId: string
  visible: boolean
  onClose: () => void
}

/** Owner only. The old code and printed QR codes stop working immediately. */
export function RotateCodeSheet({ clubId, visible, onClose }: RotateCodeSheetProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { refresh } = useClubs()
  const errorText = useClubErrorText()
  const rotate = useMutation({
    mutationFn: async () => {
      await rpc('rotate_invite_code', { p_club_id: clubId })
      await refresh()
    },
    onSuccess: onClose,
  })
  const close = (): void => {
    rotate.reset()
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('clubSettings.rotateTitle')}
      subtitle={t('clubSettings.rotateBody')}
      locked={rotate.isPending}>
      <Stack gap={space.md}>
        {rotate.error ? (
          <Text variant="label" tone={color.danger} accessibilityRole="alert">
            {errorText(rotate.error)}
          </Text>
        ) : null}
        <Button label={t('clubSettings.rotateConfirm')} variant="danger" block loading={rotate.isPending} onPress={() => rotate.mutate()} />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={rotate.isPending} onPress={close} />
      </Stack>
    </Sheet>
  )
}
