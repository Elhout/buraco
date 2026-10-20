import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { Button, Card, Screen, Segmented, Sheet, Stack, Text } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { StepDots } from '@/features/auth/screens/StepDots'
import { color, space } from '@/theme/tokens'
import { CreateClubForm } from './CreateClubForm'
import { JoinClubForm } from './JoinClubForm'

type Mode = 'join' | 'create'

/**
 * Last onboarding step for someone without a club. Once a club exists the root guard swaps
 * this screen for the tabs, so success needs no navigation here.
 */
export function ClubSetupScreen() {
  const { t } = useTranslation('auth')
  const { profile } = useSession()
  const [mode, setMode] = useState<Mode>('join')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  return (
    <Screen contentStyle={styles.content}>
      <StepDots step={3} total={3} label={t('onboarding.step', { step: 3, total: 3 })} />
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('club.setupTitle', { name: profile?.display_name ?? '' })}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('club.setupSubtitle')}
        </Text>
      </Stack>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'join', label: t('club.modeJoin') },
          { value: 'create', label: t('club.modeCreate') },
        ]}
      />
      <Card tone="surface" accent={mode === 'join' ? color.teamB : color.teamA}>
        {mode === 'join' ? <JoinClubForm onJoined={() => undefined} /> : <CreateClubForm onCreated={() => undefined} />}
      </Card>
      <Button label={t('club.wrongAccount')} variant="quiet" onPress={() => setConfirmSignOut(true)} />
      <SignOutSheet visible={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
    </Screen>
  )
}

function SignOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { signOut } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <Sheet visible={visible} onClose={onClose} title={t('signOut.title')} subtitle={t('signOut.body')} locked={busy}>
      <Stack gap={space.md}>
        <Button
          label={t('signOut.confirm')}
          variant="danger"
          block
          loading={busy}
          onPress={() => {
            setBusy(true)
            void signOut().finally(() => setBusy(false))
          }}
        />
        <Button label={tc('actions.cancel')} variant="quiet" block disabled={busy} onPress={onClose} />
      </Stack>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl },
})
