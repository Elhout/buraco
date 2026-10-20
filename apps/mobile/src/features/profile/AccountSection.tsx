import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, ListRow, SectionTitle, Sheet, Stack } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { color, space } from '@/theme/tokens'
import { ChangePasswordSheet } from './ChangePasswordSheet'
import { DeleteAccountSheet } from './DeleteAccountSheet'

/** Change password, sign out, and at the very bottom the in-app account deletion Apple requires (5.1.1(v)). */
export function AccountSection() {
  const { t } = useTranslation('profile')
  const [open, setOpen] = useState<'password' | 'signOut' | 'delete' | null>(null)
  return (
    <Stack>
      <SectionTitle>{t('account.section')}</SectionTitle>
      <Card>
        <ListRow
          title={t('account.changePassword')}
          leading={<Ionicons name="key-outline" size={22} color={color.inkMuted} />}
          onPress={() => setOpen('password')}
        />
        <ListRow
          title={t('account.signOut')}
          leading={<Ionicons name="log-out-outline" size={22} color={color.inkMuted} />}
          onPress={() => setOpen('signOut')}
        />
        <ListRow
          title={t('account.delete')}
          subtitle={t('account.deleteHint')}
          danger
          leading={<Ionicons name="trash-outline" size={22} color={color.danger} />}
          onPress={() => setOpen('delete')}
        />
      </Card>
      <ChangePasswordSheet visible={open === 'password'} onClose={() => setOpen(null)} />
      <SignOutSheet visible={open === 'signOut'} onClose={() => setOpen(null)} />
      <DeleteAccountSheet visible={open === 'delete'} onClose={() => setOpen(null)} />
    </Stack>
  )
}

function SignOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const { signOut } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <Sheet visible={visible} onClose={onClose} title={t('account.signOutTitle')} subtitle={t('account.signOutBody')} locked={busy}>
      <Stack gap={space.md}>
        <Button
          label={t('account.signOut')}
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
