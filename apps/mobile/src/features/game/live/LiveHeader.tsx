import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { I18nManager, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { WatchersChip } from './WatchersSheet'
import { HIT, color, radius, space } from '@/theme/tokens'

interface LiveHeaderProps {
  readonly title: string
  readonly isGhost: boolean
  /** Spectator count chip; omitted on screens that don't track presence. */
  readonly watchers?: { readonly count: number; readonly onPress: () => void }
  /** Extra trailing control, e.g. the admin's Manage game button. */
  readonly action?: ReactNode
}

export function goBackOrLobby(): void {
  if (router.canGoBack()) router.back()
  else router.replace('/club')
}

/** Back, title and (for admins and the players at the table) who's watching. */
export function LiveHeader({ title, watchers, action }: LiveHeaderProps) {
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
      {watchers ? <WatchersChip count={watchers.count} onPress={watchers.onPress} /> : null}
      {action}
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
