import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { formatCountdown } from '@/lib/format'
import { color, font, radius, space } from '@/theme/tokens'
import { type ClockTone, clockState } from '../model'

const TICK_MS = 1_000

/** Current time, re-rendering every second while enabled. */
export function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

const TONE: Record<ClockTone, { fg: string; bg: string }> = {
  calm: { fg: color.ink, bg: color.raised },
  warning: { fg: color.warning, bg: color.warningSoft },
  danger: { fg: color.danger, bg: color.dangerSoft },
  over: { fg: color.danger, bg: color.dangerSoft },
}

/** The round clock: a countdown readable from across the room; warning under 5 min, danger under 1. */
export function RoundClock({ roundNo, endsAt }: { roundNo: number; endsAt: string }) {
  const { t } = useTranslation('tournament')
  const now = useNow(true)
  const { msLeft, tone } = clockState(endsAt, now)
  const p = TONE[tone]
  const over = tone === 'over'
  return (
    <View
      style={[styles.box, { backgroundColor: p.bg, borderColor: p.fg }]}
      accessibilityRole="timer"
      accessibilityLabel={`${t('detail.clockLabel', { n: roundNo })}: ${over ? t('detail.timesUp') : formatCountdown(msLeft)}`}>
      <View style={styles.head}>
        <Ionicons name={over ? 'alarm' : 'time-outline'} size={18} color={p.fg} />
        <Text variant="label" tone={p.fg}>
          {t('detail.roundOf', { n: roundNo })}
        </Text>
      </View>
      {over ? (
        <>
          <Text variant="score" tone={p.fg} style={styles.big}>
            {t('detail.timesUp')}
          </Text>
          <Text variant="caption" tone={color.inkMuted}>
            {t('detail.timesUpHint')}
          </Text>
        </>
      ) : (
        <View style={styles.row}>
          <Text variant="scoreXl" tone={p.fg} style={styles.digits}>
            {formatCountdown(msLeft)}
          </Text>
          <Text variant="label" tone={color.inkMuted}>
            {t('detail.timeLeft')}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  digits: { fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  big: { fontFamily: font.bold },
})
