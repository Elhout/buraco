import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from 'react-native'
import { Card, ListRow, PinSheet, SectionTitle, Stack } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { disableBiometricPin, enableBiometricPin } from '@/lib/biometricPin'
import { rpcWithPin } from '@/lib/rpc'
import { color } from '@/theme/tokens'
import { profileKeys, useBiometricState } from './biometric'
import { ChangePinSheet } from './ChangePinSheet'
import { ResetPinSheet } from './ResetPinSheet'

type Open = 'change' | 'reset' | 'biometric' | null

export interface PinSectionProps {
  /** Open the reset flow right away (e.g. /profile?resetPin=1 from another screen's "Forgot PIN?"). */
  startReset?: boolean
}

export function PinSection({ startReset }: PinSectionProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const userId = useUserId()
  const client = useQueryClient()
  const bio = useBiometricState(userId)
  const [open, setOpen] = useState<Open>(startReset ? 'reset' : null)
  const typedPin = useRef<string | null>(null)

  // A later deep link (?resetPin=1) opens the reset flow (state adjusted during render).
  const [seenReset, setSeenReset] = useState(startReset)
  if (startReset !== seenReset) {
    setSeenReset(startReset)
    if (startReset) setOpen('reset')
  }

  const refreshBio = (): Promise<void> => client.invalidateQueries({ queryKey: profileKeys.biometric(userId) })

  const toggleBiometric = (on: boolean): void => {
    if (on) setOpen('biometric')
    else void disableBiometricPin(userId).then(refreshBio)
  }

  return (
    <Stack>
      <SectionTitle>{t('pin.section')}</SectionTitle>
      <Card>
        <ListRow
          title={t('pin.change')}
          subtitle={t('pin.changeHint')}
          leading={<Ionicons name="keypad-outline" size={22} color={color.inkMuted} />}
          onPress={() => setOpen('change')}
        />
        <ListRow
          title={t('pin.forgot')}
          subtitle={t('pin.forgotHint')}
          leading={<Ionicons name="help-buoy-outline" size={22} color={color.inkMuted} />}
          onPress={() => setOpen('reset')}
        />
        {bio.available ? (
          <ListRow
            title={t('pin.biometric')}
            subtitle={t('pin.biometricHint')}
            leading={<Ionicons name="finger-print" size={22} color={color.inkMuted} />}
            trailing={
              <Switch
                value={bio.enabled}
                disabled={bio.loading}
                onValueChange={toggleBiometric}
                trackColor={{ false: color.line, true: color.teamA }}
                thumbColor={color.ivory}
                accessibilityLabel={t('pin.biometric')}
              />
            }
          />
        ) : null}
      </Card>
      <ChangePinSheet visible={open === 'change'} onClose={() => setOpen(null)} onForgot={() => setOpen('reset')} />
      <ResetPinSheet visible={open === 'reset'} onClose={() => setOpen(null)} />
      <PinSheet
        visible={open === 'biometric'}
        userId={userId}
        title={t('pin.biometricConfirm')}
        onSubmit={async (pin) => {
          const result = await rpcWithPin('check_my_pin', { p_pin: pin })
          typedPin.current = result.ok ? pin : null
          return result
        }}
        onSuccess={() => {
          const pin = typedPin.current
          typedPin.current = null
          setOpen(null)
          if (pin) void enableBiometricPin(userId, pin, tc('pin.biometricPrompt')).then(refreshBio, refreshBio)
        }}
        onClose={() => setOpen(null)}
        onForgot={() => setOpen('reset')}
      />
    </Stack>
  )
}
