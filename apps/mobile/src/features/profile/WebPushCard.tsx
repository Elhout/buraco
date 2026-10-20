import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, Stack } from '@/components/ui'
import { type WebPushState, enableWebPush, webPushState } from '@/lib/push'
import { space } from '@/theme/tokens'

/**
 * Web build only (iPhone home-screen app): how to get notifications. Renders nothing on phones
 * with the native app, where push is set up automatically, and once notifications are on.
 */
export function WebPushCard() {
  const { t } = useTranslation('profile')
  const [state, setState] = useState<WebPushState>(webPushState)
  const [busy, setBusy] = useState(false)

  if (state === 'unsupported' || state === 'granted') return null
  if (state === 'needsInstall') return <Banner tone="info">{t('webPush.install')}</Banner>
  if (state === 'denied') return <Banner tone="warning">{t('webPush.denied')}</Banner>
  return (
    <Stack gap={space.sm}>
      <Banner tone="info">{t('webPush.prompt')}</Banner>
      <Button
        label={t('webPush.enable')}
        variant="secondary"
        block
        loading={busy}
        onPress={() => {
          setBusy(true)
          void enableWebPush()
            .then(setState)
            .catch(() => setState(webPushState()))
            .finally(() => setBusy(false))
        }}
      />
    </Stack>
  )
}
