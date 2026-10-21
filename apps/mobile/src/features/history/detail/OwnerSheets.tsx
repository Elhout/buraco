import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, Field, Sheet, Stack, TeamBadge } from '@/components/ui'
import type { RoundView } from '@/features/game/model'
import { formatNumber } from '@/lib/format'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { space } from '@/theme/tokens'
import { parseScore } from './parseScore'

const useRefresh = (gameId: string, clubId: string) => {
  const client = useQueryClient()
  return async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.game(gameId) }),
      client.invalidateQueries({ queryKey: qk.historyAll(clubId) }),
      client.invalidateQueries({ queryKey: qk.stats(clubId) }),
    ])
  }
}

export interface EditRoundSheetProps {
  gameId: string
  clubId: string
  round: RoundView | null
  onClose: () => void
}

/** Owner only: correct a confirmed round's scores. A finished game's winner follows the new totals. */
export function EditRoundSheet({ gameId, clubId, round, onClose }: EditRoundSheetProps) {
  const { t } = useTranslation(['history', 'common'])
  const refresh = useRefresh(gameId, clubId)
  const [a, setA] = useState(String(round?.teamA ?? 0))
  const [b, setB] = useState(String(round?.teamB ?? 0))
  const scoreA = parseScore(a)
  const scoreB = parseScore(b)
  const save = useMutation({
    mutationFn: async () => {
      if (!round || scoreA === null || scoreB === null) return
      await rpc('edit_round_scores', { p_round_id: round.id, p_team_a: scoreA, p_team_b: scoreB })
      await refresh()
    },
    onSuccess: onClose,
  })

  return (
    <Sheet
      visible={round !== null}
      onClose={onClose}
      title={t('detail.editTitle', { n: formatNumber(round?.displayNo ?? 0) })}
      subtitle={t('detail.editBody')}
      locked={save.isPending}>
      <Stack gap={space.md}>
        <View style={styles.fields}>
          {(['A', 'B'] as const).map((team) => (
            <View key={team} style={styles.field}>
              <TeamBadge team={team} />
              <Field
                label={t('detail.teamScore', { team })}
                value={team === 'A' ? a : b}
                onChangeText={team === 'A' ? setA : setB}
                keyboardType="numbers-and-punctuation"
                maxLength={7}
                error={(team === 'A' ? scoreA : scoreB) === null ? t('detail.scoreInvalid') : null}
              />
            </View>
          ))}
        </View>
        <ErrorText error={save.error} />
        <Button
          label={t('detail.saveEdit')}
          size="lg"
          block
          loading={save.isPending}
          disabled={scoreA === null || scoreB === null}
          onPress={() => save.mutate()}
        />
        <Button label={t('common:actions.cancel')} variant="quiet" block disabled={save.isPending} onPress={onClose} />
      </Stack>
    </Sheet>
  )
}

export interface DeleteGameSheetProps {
  gameId: string
  clubId: string
  visible: boolean
  onClose: () => void
}

/** Owner only: remove the game from history and stats for good. */
export function DeleteGameSheet({ gameId, clubId, visible, onClose }: DeleteGameSheetProps) {
  const { t } = useTranslation(['history', 'common'])
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: async () => {
      await rpc('delete_game', { p_game_id: gameId })
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.historyAll(clubId) }),
        client.invalidateQueries({ queryKey: qk.stats(clubId) }),
        client.invalidateQueries({ queryKey: qk.lobby(clubId) }),
      ])
      client.removeQueries({ queryKey: qk.game(gameId) })
    },
    onSuccess: () => {
      onClose()
      router.replace('/history')
    },
  })
  return (
    <Sheet visible={visible} onClose={onClose} title={t('detail.deleteTitle')} subtitle={t('detail.deleteBody')} locked={remove.isPending}>
      <Stack gap={space.md}>
        <ErrorText error={remove.error} />
        <Button
          label={t('detail.deleteConfirm')}
          variant="danger"
          size="lg"
          block
          loading={remove.isPending}
          onPress={() => remove.mutate()}
        />
        <Button label={t('common:actions.cancel')} variant="quiet" block disabled={remove.isPending} onPress={onClose} />
      </Stack>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: space.md },
  field: { flex: 1, gap: space.xs },
})
