import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, ErrorText, ListRow, Sheet, Stack } from '@/components/ui'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { HIT, color, radius, space } from '@/theme/tokens'

/** Games an admin can still stop: being set up, collecting invites, or being played. */
const CURRENT = new Set(['draft', 'inviting', 'live'])

type Action = 'end' | 'delete'

/**
 * Club owner and admins: a shield button on a current game that ends it at once (no PINs or
 * approvals; it shows as abandoned) or deletes it outright. Renders nothing for everyone else.
 */
export function AdminGameButton({ gameId, status }: { gameId: string; status: string }) {
  const { t } = useTranslation(['game', 'common'])
  const { role } = useCurrentClub()
  const [open, setOpen] = useState(false)
  if ((role !== 'owner' && role !== 'admin') || !CURRENT.has(status)) return null
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('admin.button')}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Ionicons name="shield-outline" size={22} color={color.ink} />
      </Pressable>
      {open ? <AdminGameSheet gameId={gameId} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function AdminGameSheet({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const { t } = useTranslation(['game', 'common'])
  const { club } = useCurrentClub()
  const client = useQueryClient()
  const [action, setAction] = useState<Action | null>(null)
  const run = useMutation({
    mutationFn: async (a: Action) => {
      if (a === 'end') await rpc('end_game', { p_game_id: gameId })
      else await rpc('delete_game', { p_game_id: gameId })
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.lobby(club.id) }),
        client.invalidateQueries({ queryKey: qk.historyAll(club.id) }),
        client.invalidateQueries({ queryKey: qk.stats(club.id) }),
      ])
      if (a === 'delete') client.removeQueries({ queryKey: qk.game(gameId) })
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onClose()
      router.replace('/club')
    },
  })

  if (action) {
    return (
      <Sheet visible onClose={onClose} title={t(`admin.${action}Title`)} subtitle={t(`admin.${action}Body`)} locked={run.isPending}>
        <Stack gap={space.md}>
          <ErrorText error={run.error} />
          <Button
            label={t(`admin.${action}Confirm`)}
            variant="danger"
            size="lg"
            block
            loading={run.isPending}
            onPress={() => run.mutate(action)}
          />
          <Button label={t('common:actions.cancel')} variant="quiet" block disabled={run.isPending} onPress={() => setAction(null)} />
        </Stack>
      </Sheet>
    )
  }
  return (
    <Sheet visible onClose={onClose} title={t('admin.title')} subtitle={t('admin.subtitle')}>
      <View>
        <ListRow
          title={t('admin.end')}
          subtitle={t('admin.endHint')}
          leading={<Ionicons name="flag-outline" size={22} color={color.danger} />}
          danger
          onPress={() => setAction('end')}
        />
        <ListRow
          title={t('admin.delete')}
          subtitle={t('admin.deleteHint')}
          leading={<Ionicons name="trash-outline" size={22} color={color.danger} />}
          danger
          onPress={() => setAction('delete')}
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  button: { width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.raised },
})
