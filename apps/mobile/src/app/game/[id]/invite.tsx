import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Banner, Button, EmptyState, ErrorText, Screen } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useGame } from '@/features/game/api'
import { HostActions, PlayerActions } from '@/features/game/invite/Actions'
import { Countdown } from '@/features/game/invite/Countdown'
import { type InvitePhase, canRespond, canSwap, confirmedCount, hostCanAct, invitePhase, msLeft } from '@/features/game/invite/model'
import { SeatList } from '@/features/game/invite/SeatList'
import { SwapSheet } from '@/features/game/invite/SwapSheet'
import { useNow } from '@/features/game/invite/useNow'
import type { GameView, SeatView } from '@/features/game/model'
import { HIT, color, radius, space } from '@/theme/tokens'

const leave = (): void => (router.canGoBack() ? router.back() : router.replace('/club'))

function CloseButton() {
  const { t } = useTranslation(['lobby', 'common'])
  return (
    <Pressable
      onPress={leave}
      accessibilityRole="button"
      accessibilityLabel={t('common:actions.close')}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Ionicons name="close" size={24} color={color.ink} />
    </Pressable>
  )
}

/** Expired, cancelled or otherwise over: say so and offer a way back. */
function EndState({ phase }: { phase: Exclude<InvitePhase, 'waiting' | 'timeUp' | 'live'> }) {
  const { t } = useTranslation(['lobby', 'common'])
  const copy = {
    expired: { icon: 'time-outline', title: t('invite.expiredTitle'), body: t('invite.expiredBody') },
    cancelled: { icon: 'close-circle-outline', title: t('invite.cancelledTitle'), body: t('invite.cancelledBody') },
    over: { icon: 'flag-outline', title: t('invite.overTitle'), body: t('invite.overBody') },
  } as const
  const c = copy[phase]
  return (
    <EmptyState
      icon={c.icon}
      title={c.title}
      body={c.body}
      action={
        <View style={styles.endActions}>
          <Button label={t('invite.backToClub')} onPress={() => router.replace('/club')} />
          {phase === 'expired' ? (
            <Button label={t('invite.newGame')} variant="secondary" onPress={() => router.replace('/game/new')} />
          ) : null}
        </View>
      }
    />
  )
}

function StatusBanner({ view }: { view: GameView }) {
  const { t } = useTranslation(['lobby', 'common'])
  const declined = view.seats.find((s) => s.inviteStatus === 'declined')
  if (view.mySeat?.inviteStatus === 'declined') return <Banner tone="info">{t('invite.youDeclined')}</Banner>
  if (view.isHost && declined) return <Banner tone="warning">{t('invite.declinedBanner', { name: declined.name })}</Banner>
  if (!view.isHost && view.mySeat?.inviteStatus === 'confirmed') return <Banner tone="success">{t('invite.youreIn')}</Banner>
  return null
}

function Waiting({ view, phase, now, userId }: { view: GameView; phase: InvitePhase; now: number; userId: string }) {
  const [swapping, setSwapping] = useState<SeatView | null>(null)
  const { game } = view
  return (
    <>
      <Countdown
        msLeft={msLeft(game.invite_expires_at, now)}
        confirmed={confirmedCount(view.seats)}
        timeUp={phase === 'timeUp'}
        isHost={view.isHost}
      />
      <StatusBanner view={view} />
      <SeatList
        seats={view.seats}
        hostId={game.host_id}
        canSwap={(s) => canSwap(phase, view.isHost, s, game.host_id)}
        onSwap={setSwapping}
      />
      {canRespond(phase, view.mySeat) ? <PlayerActions gameId={game.id} userId={userId} /> : null}
      {hostCanAct(phase, view.isHost) ? <HostActions gameId={game.id} clubId={game.club_id} /> : null}
      <SwapSheet gameId={game.id} clubId={game.club_id} seat={swapping} seats={view.seats} onClose={() => setSwapping(null)} />
    </>
  )
}

/** /game/[id]/invite: four seats confirming with their PIN, the clock, and the host's controls. */
export default function InviteScreen() {
  const { t } = useTranslation(['lobby', 'common'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const userId = useUserId()
  const { view, isPending, error, refetch } = useGame(id)
  const status = view?.game.status
  const now = useNow(status === 'inviting')
  const phase = view ? invitePhase({ status: view.game.status, inviteExpiresAt: view.game.invite_expires_at }, now) : null

  useEffect(() => {
    if (phase === 'live') router.replace(`/game/${id}`)
  }, [phase, id])

  let body
  if (isPending || phase === 'live') body = <ActivityIndicator color={color.inkMuted} style={styles.loading} />
  else if (!view || error)
    body = (
      <EmptyState
        icon="cloud-offline-outline"
        title={t('invite.loadError')}
        action={
          <View style={styles.endActions}>
            <ErrorText error={error} />
            <Button label={t('common:actions.retry')} variant="secondary" onPress={() => void refetch()} />
          </View>
        }
      />
    )
  else if (phase === 'waiting' || phase === 'timeUp') body = <Waiting view={view} phase={phase} now={now} userId={userId} />
  else body = <EndState phase={phase ?? 'over'} />

  return (
    <Screen
      title={t('invite.title')}
      subtitle={t('invite.subtitle')}
      actions={<CloseButton />}
      onRefresh={() => void refetch()}
      refreshing={false}>
      {body}
    </Screen>
  )
}

const styles = StyleSheet.create({
  close: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.raised,
  },
  pressed: { opacity: 0.7 },
  loading: { paddingVertical: space.xxxl },
  endActions: { gap: space.sm, alignItems: 'center', marginTop: space.md },
})
