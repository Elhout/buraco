import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Score, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { color, radius, space, teamColor } from '@/theme/tokens'
import type { EntryPreview } from './scoreEntry'

function Side({ team, preview }: { team: Team; preview: EntryPreview }) {
  const { t } = useTranslation(['game', 'common'])
  const toGo = preview.toGo[team]
  return (
    <View style={styles.side}>
      <Score value={preview.totals[team]} size="scoreSm" tone={teamColor(team)} />
      <Text variant="caption" tone={toGo === 0 ? teamColor(team) : color.inkMuted}>
        {toGo === 0 ? t('live.atTarget') : t('live.toGo', { points: formatNumber(toGo) })}
      </Text>
    </View>
  )
}

/** "After this round": new totals and points to go, plus a heads-up if it would end or tie the game. */
export function EntryPreviewCard({ preview }: { preview: EntryPreview }) {
  const { t } = useTranslation(['game', 'common'])
  const { outcome } = preview
  const note =
    outcome.kind === 'won' ? t('enter.wouldWin', { team: outcome.winner }) : outcome.kind === 'tie_at_target' ? t('enter.wouldTie') : null
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text variant="caption" tone={color.inkMuted} style={styles.heading}>
        {t('enter.preview')}
      </Text>
      <View style={styles.row}>
        <Side team="A" preview={preview} />
        <Side team="B" preview={preview} />
      </View>
      {note ? (
        <Text variant="label" tone={outcome.kind === 'won' ? teamColor(outcome.winner) : color.warning} center>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.sunken, borderRadius: radius.md, padding: space.md, gap: space.xs },
  heading: { textTransform: 'uppercase', letterSpacing: 1.2 },
  row: { flexDirection: 'row', gap: space.md },
  side: { flex: 1, alignItems: 'center' },
})
