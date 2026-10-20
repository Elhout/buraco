import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Sheet, Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'
import type { Watcher } from './useLiveEffects'

/** "N watching" chip for the header; opens the list of spectators. */
export function WatchersChip({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('live.watching', { count })}. ${t('live.watchingA11y')}`}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <Ionicons name="eye-outline" size={16} color={color.inkMuted} />
      <Text variant="caption" tone={color.inkMuted}>
        {t('live.watching', { count })}
      </Text>
    </Pressable>
  )
}

interface WatchersSheetProps {
  readonly visible: boolean
  readonly watchers: readonly Watcher[]
  readonly onClose: () => void
}

export function WatchersSheet({ visible, watchers, onClose }: WatchersSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <Sheet visible={visible} onClose={onClose} title={t('live.spectatorsTitle')}>
      {watchers.length === 0 ? (
        <Text variant="body" tone={color.inkMuted} center>
          {t('live.spectatorsEmpty')}
        </Text>
      ) : (
        <View style={styles.list}>
          {watchers.map((w) => (
            <View key={w.key} style={styles.row}>
              <Avatar name={w.name || '?'} size={32} online />
              <Text variant="bodyStrong">{w.isMe ? t('live.spectatorYou', { name: w.name }) : w.name}</Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.raised,
  },
  pressed: { opacity: 0.8 },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 },
})
