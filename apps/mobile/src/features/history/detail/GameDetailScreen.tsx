import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { I18nManager, Pressable, StyleSheet } from 'react-native'
import { Banner, type BannerTone, EmptyState, Row, Screen, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { useGame } from '@/features/game/api'
import type { GameView } from '@/features/game/model'
import { qk } from '@/lib/queryKeys'
import { HIT, color, space } from '@/theme/tokens'
import { ErrorBlock, LoadingBlock } from '../ui'
import { AuditLog } from './AuditLog'
import { RoundsList } from './RoundsList'
import { ScoreHeader } from './ScoreHeader'
import { SeatsPanel } from './SeatsPanel'

type NoteKey = 'ghost' | 'partly' | 'abandoned' | 'expired' | 'inProgress'

function noteOf(view: GameView): { key: NoteKey; tone: BannerTone } | null {
  const { status, verified } = view.game
  if (status === 'abandoned') return { key: 'abandoned', tone: 'danger' }
  if (status === 'expired') return { key: 'expired', tone: 'warning' }
  if (status !== 'finished') return { key: 'inProgress', tone: 'info' }
  if (!view.isGhost || verified) return null
  const partly = view.seats.some((s) => !s.isGuest && s.verified)
  return { key: partly ? 'partly' : 'ghost', tone: 'ghost' }
}

/** Back control at the start edge, then the screen title. */
function TitleRow() {
  const { t } = useTranslation(['history', 'common'])
  return (
    <Row gap={space.xs}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('detail.back')}
        hitSlop={8}
        style={styles.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/history'))}>
        <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={color.ink} />
      </Pressable>
      <Text variant="display" accessibilityRole="header">
        {t('detail.title')}
      </Text>
    </Row>
  )
}

/** Game detail: totals, players and verification, every round, and the audit log. */
export function GameDetailScreen({ gameId }: { gameId: string }) {
  const { t } = useTranslation(['history', 'common'])
  const userId = useUserId()
  const { club } = useCurrentClub()
  const client = useQueryClient()
  const { nameOf } = useClubMembers(club.id)
  const game = useGame(gameId, { live: false })
  const view = game.view

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: qk.game(gameId) })
    void client.invalidateQueries({ queryKey: qk.historyAll(club.id) })
    void client.invalidateQueries({ queryKey: qk.stats(club.id) })
  }

  if (game.isPending) {
    return (
      <Screen>
        <TitleRow />
        <LoadingBlock />
      </Screen>
    )
  }
  if (!view) {
    return (
      <Screen>
        <TitleRow />
        {game.error ? <ErrorBlock error={game.error} onRetry={() => void game.refetch()} /> : <EmptyState title={t('empty.title')} />}
      </Screen>
    )
  }

  const note = noteOf(view)
  return (
    <Screen refreshing={false} onRefresh={refresh}>
      <TitleRow />
      <ScoreHeader view={view} />
      {note ? <Banner tone={note.tone}>{t(`detail.notes.${note.key}`)}</Banner> : null}
      <SeatsPanel view={view} userId={userId} onVerified={refresh} />
      <RoundsList rounds={view.rounds} />
      <AuditLog view={view} nameOf={nameOf} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', marginStart: -space.md },
})
