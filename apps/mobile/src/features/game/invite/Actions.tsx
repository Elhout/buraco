import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, PinSheet, SectionTitle } from '@/components/ui'
import { acceptInvite, cancelGame, declineInvite, switchToGhost } from '@/features/game/actions'
import { qk } from '@/lib/queryKeys'
import { color, space } from '@/theme/tokens'
import { ConfirmSheet } from './ConfirmSheet'

/** Invited player: Accept signs with the PIN; Decline goes through a sheet. */
export function PlayerActions({ gameId, userId }: { gameId: string; userId: string }) {
  const { t } = useTranslation(['lobby', 'common'])
  const client = useQueryClient()
  const [pin, setPin] = useState(false)
  const [decline, setDecline] = useState(false)
  const refresh = (): void => void client.invalidateQueries({ queryKey: qk.game(gameId) })
  return (
    <View style={styles.stack}>
      <Button
        label={t('invite.accept')}
        size="lg"
        block
        onPress={() => setPin(true)}
        icon={<Ionicons name="keypad" size={20} color={color.inkOnLight} />}
      />
      <Button label={t('invite.decline')} variant="quiet" block onPress={() => setDecline(true)} />
      <PinSheet
        visible={pin}
        userId={userId}
        title={t('invite.pinTitle')}
        subtitle={t('invite.pinSubtitle')}
        onSubmit={(value) => acceptInvite(gameId, value)}
        onSuccess={() => {
          setPin(false)
          refresh()
        }}
        onClose={() => setPin(false)}
      />
      <ConfirmSheet
        visible={decline}
        onClose={() => setDecline(false)}
        title={t('invite.declineTitle')}
        body={t('invite.declineBody')}
        confirmLabel={t('invite.declineConfirm')}
        cancelLabel={t('invite.keep')}
        danger
        action={() => declineInvite(gameId)}
        onDone={refresh}
      />
    </View>
  )
}

/** Host: give up waiting and play as ghost, or call the game off. Both behind a sheet; the screen then shows the new state. */
export function HostActions({ gameId, clubId }: { gameId: string; clubId: string }) {
  const { t } = useTranslation(['lobby', 'common'])
  const client = useQueryClient()
  const [sheet, setSheet] = useState<'ghost' | 'cancel' | null>(null)
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: qk.game(gameId) })
    void client.invalidateQueries({ queryKey: qk.lobby(clubId) })
  }
  return (
    <View style={styles.stack}>
      <SectionTitle>{t('invite.hostTitle')}</SectionTitle>
      <Button
        label={t('invite.ghost')}
        variant="secondary"
        block
        onPress={() => setSheet('ghost')}
        icon={<Ionicons name="eye-off-outline" size={18} color={color.ghost} />}
      />
      <Button label={t('invite.cancel')} variant="danger" block onPress={() => setSheet('cancel')} />
      <ConfirmSheet
        visible={sheet === 'ghost'}
        onClose={() => setSheet(null)}
        title={t('invite.ghostTitle')}
        body={t('invite.ghostBody')}
        confirmLabel={t('invite.ghostConfirm')}
        cancelLabel={t('invite.keepWaiting')}
        action={() => switchToGhost(gameId)}
        onDone={refresh}
      />
      <ConfirmSheet
        visible={sheet === 'cancel'}
        onClose={() => setSheet(null)}
        title={t('invite.cancelTitle')}
        body={t('invite.cancelBody')}
        confirmLabel={t('invite.cancelConfirm')}
        cancelLabel={t('invite.keepWaiting')}
        danger
        action={() => cancelGame(gameId)}
        onDone={refresh}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
})
