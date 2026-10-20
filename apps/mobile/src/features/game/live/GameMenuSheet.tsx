import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { ListRow, Sheet } from '@/components/ui'
import { color } from '@/theme/tokens'
import type { GameView, SeatView } from '../model'

/** Sheets reachable from the game menu; the screen opens one after the menu has closed. */
export type MenuTarget = 'undo' | 'undoApprove' | 'reassign' | 'abandon' | 'watchers'

interface GameMenuSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
  readonly onSelect: (target: MenuTarget) => void
}

/** My partner, when they can take over scoring (a confirmed member, normal games only). */
export function scorekeeperCandidate(view: GameView): SeatView | null {
  if (view.isGhost || !view.mySeat) return null
  const me = view.mySeat
  return view.seats.find((s) => s.team === me.team && s.seat !== me.seat && s.userId !== null && s.inviteStatus === 'confirmed') ?? null
}

const icon = (name: keyof typeof Ionicons.glyphMap, tone: string = color.ink) => <Ionicons name={name} size={22} color={tone} />

function UndoRow({ view, onSelect }: { view: GameView; onSelect: (target: MenuTarget) => void }) {
  const { t } = useTranslation(['game', 'common'])
  const hasConfirmed = view.rounds.some((r) => r.status === 'confirmed')
  if (view.awaitingMyUndo) {
    return <ListRow title={t('menu.undoReview')} leading={icon('arrow-undo', color.warning)} onPress={() => onSelect('undoApprove')} />
  }
  if (!view.isGhost && view.game.undo_requested_by !== null) {
    return <ListRow title={t('menu.undoRequested')} subtitle={t('menu.undoHint')} leading={icon('hourglass-outline', color.inkMuted)} />
  }
  if (!hasConfirmed) {
    return <ListRow title={t('menu.undo')} subtitle={t('menu.nothingToUndo')} leading={icon('arrow-undo-outline', color.inkFaint)} />
  }
  return (
    <ListRow
      title={t('menu.undo')}
      subtitle={view.isGhost ? t('menu.undoHintGhost') : t('menu.undoHint')}
      leading={icon('arrow-undo-outline')}
      onPress={() => onSelect('undo')}
    />
  )
}

/** Undo, hand over scoring, who's watching, abandon. Every consequential step opens its own sheet. */
export function GameMenuSheet({ visible, view, onClose, onSelect }: GameMenuSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const partner = scorekeeperCandidate(view)
  return (
    <Sheet visible={visible} onClose={onClose} title={t('menu.title')}>
      <View style={styles.list}>
        <UndoRow view={view} onSelect={onSelect} />
        {partner ? (
          <ListRow
            title={t('menu.reassign', { name: partner.name })}
            subtitle={t('menu.reassignHint')}
            leading={icon('swap-horizontal')}
            onPress={() => onSelect('reassign')}
          />
        ) : null}
        <ListRow title={t('menu.watching')} leading={icon('eye-outline')} onPress={() => onSelect('watchers')} />
        <ListRow
          title={t('menu.abandon')}
          subtitle={t('menu.abandonHint')}
          leading={icon('flag-outline', color.danger)}
          danger
          onPress={() => onSelect('abandon')}
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  list: { gap: 0 },
})
