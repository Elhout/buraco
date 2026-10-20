import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { Button, EmptyState, Sheet, Stack, Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'
import { parseInviteCode } from './inviteCode'

export interface QrScannerProps {
  visible: boolean
  onClose: () => void
  onCode: (code: string) => void
}

/** Scans a club QR (`buraco://join/<CODE>`). Anything else shows a hint and keeps scanning. */
export function QrScanner({ visible, onClose, onCode }: QrScannerProps) {
  const { t } = useTranslation('auth')
  return (
    <Sheet visible={visible} onClose={onClose} title={t('club.scanTitle')} subtitle={t('club.scanSubtitle')}>
      {visible ? <ScannerBody onCode={onCode} /> : null}
      <Button label={t('club.scanCancel')} variant="quiet" block onPress={onClose} />
    </Sheet>
  )
}

function ScannerBody({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation('auth')
  const [permission, requestPermission] = useCameraPermissions()
  const [foreign, setForeign] = useState(false)
  const handled = useRef(false)

  if (!permission) return <View style={styles.frame} />
  if (!permission.granted) {
    return (
      <EmptyState
        icon="camera-outline"
        title={t('club.cameraTitle')}
        body={t('club.cameraBody')}
        action={
          permission.canAskAgain ? (
            <Button label={t('club.cameraAllow')} onPress={() => void requestPermission()} />
          ) : (
            <Button label={t('club.cameraSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
          )
        }
      />
    )
  }

  const onScanned = ({ data }: { data: string }): void => {
    if (handled.current) return
    const code = parseInviteCode(data)
    if (!code) {
      setForeign(true)
      return
    }
    handled.current = true
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onCode(code)
  }

  return (
    <Stack gap={space.sm}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>
      <Text variant="label" tone={foreign ? color.warning : color.inkMuted} center accessibilityLiveRegion="polite">
        {foreign ? t('club.scanForeign') : t('club.scanHint')}
      </Text>
    </Stack>
  )
}

const styles = StyleSheet.create({
  frame: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: { width: 200, height: 200, borderRadius: radius.md, borderWidth: 3, borderColor: color.teamA },
})
