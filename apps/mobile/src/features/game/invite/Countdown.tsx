import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Text } from '@/components/ui'
import { formatCountdown, formatNumber, usesNativeDigits } from '@/lib/format'
import { color, font, radius, space } from '@/theme/tokens'

const WARN_MS = 2 * 60_000

export interface CountdownProps {
  msLeft: number
  confirmed: number
  timeUp: boolean
  isHost: boolean
}

/** The invite clock and how many of the four are in, as four pips. */
export function Countdown({ msLeft, confirmed, timeUp, isHost }: CountdownProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const tone = timeUp ? color.danger : msLeft <= WARN_MS ? color.warning : color.ink
  return (
    <Card tone="raised" style={styles.card}>
      <Text variant="caption" tone={color.inkMuted} style={styles.eyebrow}>
        {timeUp ? t('invite.timeUp') : t('invite.expiresIn')}
      </Text>
      <Text
        variant="scoreXl"
        tone={tone}
        style={[styles.clock, usesNativeDigits() && styles.nativeDigits]}
        accessibilityRole="timer"
        accessibilityLiveRegion="none">
        {formatCountdown(msLeft)}
      </Text>
      {timeUp ? (
        <Text variant="label" tone={color.inkMuted} center>
          {isHost ? t('invite.timeUpHost') : t('invite.timeUpPlayer')}
        </Text>
      ) : null}
      <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.pip, i < confirmed && styles.pipOn]} />
        ))}
      </View>
      <Text variant="label" tone={color.inkMuted}>
        {t('invite.progress', { n: formatNumber(confirmed) })}
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  clock: { fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  // The condensed score face only has Latin digits (same fallback as <Score>).
  nativeDigits: { fontFamily: font.bold },
  pips: { flexDirection: 'row', gap: space.sm, direction: 'ltr' },
  pip: { width: 28, height: 6, borderRadius: radius.pill, backgroundColor: color.lineStrong },
  pipOn: { backgroundColor: color.success },
})
