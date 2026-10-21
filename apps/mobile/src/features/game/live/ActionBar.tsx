import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'
import type { BlockReason } from './actionState'

interface ActionBarProps {
  readonly block: BlockReason | null
  /** My team, for the button colour; null for the ghost host. */
  readonly team: Team | null
  /** Team whose confirmation we wait for (normal games). */
  readonly waitingFor: Team | null
  readonly isGhost: boolean
  readonly onEnter: () => void
  readonly onMenu: () => void
}

function useBlockText(block: BlockReason | null, waitingFor: Team | null, isGhost: boolean): string | null {
  const { t } = useTranslation(['game', 'common'])
  if (block === null) return null
  if (block === 'waitingOther') {
    return isGhost || !waitingFor ? t('bar.block.waitingGhost') : t('bar.block.waitingOther', { team: waitingFor })
  }
  return t(`bar.block.${block}`)
}

/** Scorekeeper controls, pinned at the bottom within thumb reach. Spectators never see it. */
/** The exact cut is the +100 button under each team's score (TotalsHeader). */
export function ActionBar({ block, team, waitingFor, isGhost, onEnter, onMenu }: ActionBarProps) {
  const { t } = useTranslation(['game', 'common'])
  const insets = useSafeAreaInsets()
  const reason = useBlockText(block, waitingFor, isGhost)
  const disabled = block !== null
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {reason ? (
        <Text variant="caption" tone={color.inkMuted} center accessibilityLiveRegion="polite">
          {reason}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.enter}>
          <Button
            label={t('bar.enter')}
            variant={team === 'B' ? 'teamB' : team === 'A' ? 'teamA' : 'primary'}
            size="lg"
            block
            disabled={disabled}
            onPress={onEnter}
            accessibilityHint={reason ?? undefined}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bar.menu')}
          onPress={onMenu}
          style={({ pressed }) => [styles.menu, pressed && styles.menuPressed]}>
          <Ionicons name="ellipsis-horizontal" size={26} color={color.ink} />
        </Pressable>
      </View>
    </View>
  )
}

const MENU_SIZE = 60

const styles = StyleSheet.create({
  bar: {
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  enter: { flex: 3 },
  cut: { flex: 2 },
  menu: {
    width: MENU_SIZE,
    height: MENU_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: color.lineStrong,
  },
  menuPressed: { backgroundColor: color.raised },
})
