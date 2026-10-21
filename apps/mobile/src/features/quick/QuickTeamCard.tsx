import type { Team } from '@buraco/shared'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Score, TargetBar, TeamBadge, Text } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import { color, elevation, radius, space, teamColor } from '@/theme/tokens'
import { QUICK_CUT_BONUS } from './model'

export interface QuickTeamCardProps {
  team: Team
  name: string
  total: number
  target: number
  leading: boolean
  onRename: () => void
  /** +100 exact cut for this team, straight away (no round entry). Hidden once the game is over. */
  onCut?: () => void
}

/** One team: name (tap to rename), big running total, progress to the target and the +100 cut. */
export function QuickTeamCard({ team, name, total, target, leading, onRename, onCut }: QuickTeamCardProps) {
  const { t } = useTranslation('quick')
  const toGo = Math.max(0, target - total)
  return (
    <View style={[styles.card, { borderColor: leading ? teamColor(team) : color.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('renameA11y', { team })}
        onPress={onRename}
        hitSlop={6}
        style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}>
        <TeamBadge team={team} size="sm" />
        <Text variant="label" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Ionicons name="pencil" size={14} color={color.inkFaint} />
      </Pressable>
      <Score
        value={total}
        size="scoreXl"
        tone={teamColor(team)}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.score, scoreFit(formatNumber(total))]}
      />
      <TargetBar team={team} value={total} target={target} />
      <Text variant="caption" tone={toGo === 0 ? teamColor(team) : color.inkMuted}>
        {toGo === 0 ? t('atTarget') : t('toGo', { points: formatNumber(toGo) })}
      </Text>
      {onCut ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('cutA11y', { team, points: formatSigned(QUICK_CUT_BONUS) })}
          onPress={onCut}
          hitSlop={6}
          style={({ pressed }) => [styles.cut, { borderColor: teamColor(team) }, pressed && { backgroundColor: teamColor(team) }]}>
          {({ pressed }) => (
            <Text variant="label" tone={pressed ? color.onPrimary : teamColor(team)}>
              {t('cut', { points: formatSigned(QUICK_CUT_BONUS) })}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Half a phone width holds about four big digits; longer totals ("1,800", "-1,250") shrink so
 * they never get cut off. adjustsFontSizeToFit does this on phones but not in the web build.
 */
const scoreFit = (text: string): { fontSize: number; lineHeight: number } | null => {
  const scale = Math.min(1, 4 / Math.max(text.length, 1))
  return scale < 1 ? { fontSize: Math.round(72 * scale), lineHeight: Math.round(76 * scale) } : null
}

const styles = StyleSheet.create({
  cut: { alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1.5 },
  card: {
    flex: 1,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: color.surface,
    ...elevation.card,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
  name: { flex: 1 },
  pressed: { opacity: 0.6 },
  score: { textAlign: 'center' },
})
