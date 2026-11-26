import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { BigNumber } from '@/features/stats/viz'
import { formatNumber, formatPercent } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import type { ClubKpis, Kpi } from './kpis'

type IconName = ComponentProps<typeof Ionicons>['name']

const CARDS: readonly { key: keyof ClubKpis; icon: IconName; tone: string }[] = [
  { key: 'bestWinRate', icon: 'trophy', tone: color.accent },
  { key: 'hotStreak', icon: 'flame', tone: color.danger },
  { key: 'bestStreak', icon: 'trending-up', tone: color.success },
  { key: 'biggestWin', icon: 'flash', tone: color.accent },
  { key: 'mostCuts', icon: 'cut', tone: color.ink },
  { key: 'mostGames', icon: 'albums', tone: color.ink },
]

const kpiText = (key: keyof ClubKpis, value: number): string =>
  key === 'bestWinRate' ? formatPercent(value) : key === 'biggestWin' ? `+${formatNumber(value)}` : formatNumber(value)

/** Two-column highlight cards above the Players board; tap one to open that player. */
export function KpiCards({ kpis, nameOf }: { kpis: ClubKpis; nameOf: (userId: string) => string }) {
  const { t } = useTranslation('players')
  const shown = CARDS.flatMap((c) => {
    const kpi: Kpi | null = kpis[c.key]
    return kpi ? [{ ...c, kpi }] : []
  })
  if (shown.length === 0) return null
  return (
    <View style={styles.grid}>
      {shown.map(({ key, icon, tone, kpi }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={t(`kpi.${key}A11y`, { name: nameOf(kpi.userId), n: kpiText(key, kpi.value) })}
          onPress={() => router.push({ pathname: '/player/[id]', params: { id: kpi.userId } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <View style={styles.head}>
            <Ionicons name={icon} size={16} color={tone} />
            <Text variant="caption" tone={color.inkMuted} numberOfLines={1} style={styles.label}>
              {t(`kpi.${key}`)}
            </Text>
          </View>
          <BigNumber text={kpiText(key, kpi.value)} size="score" tone={tone} />
          <Text variant="bodyStrong" numberOfLines={1}>
            {nameOf(kpi.userId)}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  pressed: { backgroundColor: color.raised },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  label: { flexShrink: 1 },
})
