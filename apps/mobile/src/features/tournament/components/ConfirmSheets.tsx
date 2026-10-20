import { useTranslation } from 'react-i18next'
import { Banner, Button, ErrorText, Sheet, Stack, Text } from '@/components/ui'
import { color } from '@/theme/tokens'

interface BaseProps {
  visible: boolean
  onClose: () => void
  busy: boolean
  error: unknown
}

/** Starting locks the entrant list, so it is confirmed in a sheet. */
export function StartSheet({ visible, onClose, busy, error, count, onStart }: BaseProps & { count: number; onStart: () => void }) {
  const { t } = useTranslation('tournament')
  return (
    <Sheet visible={visible} onClose={onClose} locked={busy} title={t('start.title')} subtitle={t('start.body', { count })}>
      <ErrorText error={error} />
      <Button size="lg" block loading={busy} label={t('organizer.start')} onPress={onStart} />
    </Sheet>
  )
}

/** Finish (freezes standings) or cancel (stops the event); both irreversible. */
export function CloseSheet({
  visible,
  onClose,
  busy,
  error,
  roundLive,
  onFinish,
}: BaseProps & { roundLive: boolean; onFinish: (cancel: boolean) => void }) {
  const { t } = useTranslation('tournament')
  return (
    <Sheet visible={visible} onClose={onClose} locked={busy} title={t('close.title')}>
      <Stack gap={8}>
        <Text variant="body" tone={color.inkMuted}>
          {t('close.finishBody')}
        </Text>
        {roundLive ? <Banner tone="warning">{t('close.finishBlocked')}</Banner> : null}
        <Button size="lg" block disabled={roundLive} loading={busy} label={t('close.finish')} onPress={() => onFinish(false)} />
      </Stack>
      <Stack gap={8}>
        <Text variant="body" tone={color.inkMuted}>
          {t('close.cancelBody')}
        </Text>
        <Button variant="danger" block disabled={busy} label={t('close.cancel')} onPress={() => onFinish(true)} />
      </Stack>
      <ErrorText error={error} />
    </Sheet>
  )
}
