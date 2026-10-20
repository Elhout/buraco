import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { I18nManager, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { HIT, color, radius, space } from '@/theme/tokens'
import { WatchersChip } from './WatchersSheet'

interface LiveHeaderProps {
  readonly title: string
  readonly isGhost: boolean
  /** Spectator count chip; omitted on screens that don't track presence. */
  readonly watchers?: { readonly count: number; readonly onPress: () => void }
}

export function goBackOrLobby(): void {
  if (router.canGoBack()) router.back()
  else router.replace('/club')
}

/** Back, title, ghost badge and the spectator count. */
export function LiveHeader({ title, isGhost, watchers }: LiveHeaderProps) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.back')}
        onPress={goBackOrLobby}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={color.ink} />
      </Pressable>
      <Text variant="title" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {isGhost ? (
        <View style={styles.ghost}>
          <Ionicons name="eye-off-outline" size={14} color={color.ghost} />
          <Text variant="caption" tone={color.ghost}>
            {t('live.ghost')}
          </Text>
        </View>
      ) : null}
      {watchers ? <WatchersChip count={watchers.count} onPress={watchers.onPress} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, marginStart: -space.sm },
  pressed: { backgroundColor: color.raised },
  title: { flex: 1 },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: color.ghostSoft,
  },
})
