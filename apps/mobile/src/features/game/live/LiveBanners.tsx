import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Banner, Text, useErrorText } from '@/components/ui'
import { AppError, type ErrorCode } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import type { GameView } from '../model'
import { opponentOf } from './actionState'
import type { SheetKind } from './useLiveSheets'

interface LiveBannersProps {
  readonly view: GameView
  readonly offline: boolean
  readonly refusal: ErrorCode | null
  readonly onDismissRefusal: () => void
  readonly onOpen: (kind: SheetKind) => void
}

/** Small text action inside a banner (keeps a 48pt target without a full button). */
function BannerAction({ label, onPress, tone = color.ink }: { label: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text variant="label" tone={tone}>
        {label}
      </Text>
    </Pressable>
  )
}

function RefusalBanner({ view, code, onDismiss }: { view: GameView; code: ErrorCode; onDismiss: () => void }) {
  const { t } = useTranslation(['game', 'common'])
  const errorText = useErrorText()
  const text =
    code === 'roundPending'
      ? t('live.roundRefused', { team: opponentOf(view.myTeam ?? 'A') })
      : t('live.roundNotSent', { reason: errorText(new AppError(code, code)) })
  return (
    <Banner tone="danger" action={<BannerAction label={t('live.dismiss')} onPress={onDismiss} tone={color.danger} />}>
      {text}
    </Banner>
  )
}

/** Things this phone has to act on: the result, a round to confirm, an undo to answer. */
function ActionBanners({ view, onOpen }: { view: GameView; onOpen: (kind: SheetKind) => void }) {
  const { t } = useTranslation(['game', 'common'])
  const { game } = view
  const result = view.resultProposed ? (
    <Banner
      tone="success"
      action={<BannerAction label={t('live.resultOpen')} onPress={() => router.push(`/game/${game.id}/result`)} tone={color.success} />}>
      {t('live.resultReady')}
    </Banner>
  ) : null
  const confirm = view.awaitingMyConfirmation ? (
    <Banner tone="warning" action={<BannerAction label={t('live.confirmOpen')} onPress={() => onOpen('confirm')} tone={color.warning} />}>
      {t('live.confirmWaiting', { n: formatNumber(view.awaitingMyConfirmation.displayNo) })}
    </Banner>
  ) : null
  const requester = game.undo_requested_by
  const undo =
    view.awaitingMyUndo && requester ? (
      <Banner
        tone="warning"
        action={<BannerAction label={t('live.undoReview')} onPress={() => onOpen('undoApprove')} tone={color.warning} />}>
        {t('live.undoWaiting', { team: requester })}
      </Banner>
    ) : !view.isGhost && view.canScore && requester !== null && requester === view.myTeam ? (
      <Banner>{t('live.undoRequested', { team: opponentOf(requester) })}</Banner>
    ) : null
  return (
    <>
      {result}
      {confirm}
      {undo}
    </>
  )
}

/** Facts about the game itself: clock expired, tie at the target, ghost (unverified). */
function GameBanners({ view }: { view: GameView }) {
  const { t } = useTranslation(['game', 'common'])
  const { game } = view
  const live = game.status === 'live'
  return (
    <>
      {live && game.tournament_match_id && game.clock_expired_at ? <Banner tone="warning">{t('live.clockExpired')}</Banner> : null}
      {live && view.outcome.kind === 'tie_at_target' ? <Banner tone="warning">{t('live.tie')}</Banner> : null}
      {view.needsVerification ? <Banner tone="ghost">{t('live.ghostNote')}</Banner> : null}
    </>
  )
}

/** Everything the table should notice, most urgent first. */
export function LiveBanners({ view, offline, refusal, onDismissRefusal, onOpen }: LiveBannersProps) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.stack}>
      {offline ? <Banner tone="danger">{t('common:connection.offline')}</Banner> : null}
      {refusal ? <RefusalBanner view={view} code={refusal} onDismiss={onDismissRefusal} /> : null}
      <ActionBanners view={view} onOpen={onOpen} />
      <GameBanners view={view} />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  action: { minHeight: 32, paddingHorizontal: space.sm, justifyContent: 'center', borderRadius: radius.sm },
  pressed: { opacity: 0.7 },
})
