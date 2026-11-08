import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, ErrorText } from '@/components/ui'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { qk } from '@/lib/queryKeys'
import { color } from '@/theme/tokens'
import { createGame } from './actions'
import type { GameView } from './model'
import { rematchSeats } from './rematch'

/**
 * A finished game: the same four players, same teams (guests too), same kind of game. A start-now
 * game begins at once; a game with invites sends them again. Not for tournament games.
 */
export function PlayAgainButton({ view, variant = 'primary' }: { view: GameView; variant?: 'primary' | 'secondary' }) {
  const { t } = useTranslation('game')
  const { club } = useCurrentClub()
  const client = useQueryClient()
  const start = useMutation({
    mutationFn: () => createGame(club.id, rematchSeats(view.seats), view.game.mode),
    onSuccess: (id) => {
      void client.invalidateQueries({ queryKey: qk.lobby(club.id) })
      router.replace(view.game.mode === 'ghost' ? `/game/${id}` : `/game/${id}/invite`)
    },
  })
  if (view.game.tournament_match_id !== null) return null
  return (
    <>
      <Button
        label={t('playAgain.button')}
        variant={variant}
        size="lg"
        block
        loading={start.isPending}
        icon={<Ionicons name="refresh" size={20} color={variant === 'primary' ? color.onPrimary : color.ink} />}
        onPress={() => start.mutate()}
      />
      <ErrorText error={start.error} />
    </>
  )
}
