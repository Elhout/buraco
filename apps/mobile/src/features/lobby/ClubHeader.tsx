import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Divider, ListRow, Sheet, Text } from '@/components/ui'
import { useSession } from '@/features/auth/SessionProvider'
import { type MyClub, useClubs } from '@/features/clubs/ClubProvider'
import { HIT, color, radius, space } from '@/theme/tokens'

function ClubSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation(['lobby', 'common'])
  const { clubs, current, select } = useClubs()
  const go = (path: '/club/join' | '/club/settings'): void => {
    onClose()
    router.push(path)
  }
  const pick = (c: MyClub): void => {
    select(c.club.id)
    onClose()
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('switcher.title')} subtitle={t('switcher.subtitle')}>
      <View>
        {clubs.map((c) => {
          const active = c.club.id === current?.club.id
          return (
            <ListRow
              key={c.club.id}
              title={c.club.name}
              subtitle={active ? t('switcher.current') : t(`switcher.role.${c.role}`)}
              leading={<Avatar name={c.club.name} size={40} ring={active ? color.ivory : undefined} />}
              trailing={active ? <Ionicons name="checkmark-circle" size={24} color={color.ivory} /> : undefined}
              onPress={() => pick(c)}
            />
          )
        })}
      </View>
      <Divider />
      <View>
        <ListRow
          title={t('switcher.join')}
          leading={<Ionicons name="add-circle-outline" size={24} color={color.ink} />}
          onPress={() => go('/club/join')}
        />
        <ListRow
          title={t('switcher.settings')}
          leading={<Ionicons name="settings-outline" size={24} color={color.ink} />}
          onPress={() => go('/club/settings')}
        />
      </View>
    </Sheet>
  )
}

/** Lobby header: the club name doubles as the club switcher; my avatar opens the profile. */
export function ClubHeader() {
  const { t } = useTranslation(['lobby', 'common'])
  const { current } = useClubs()
  const { profile } = useSession()
  const [open, setOpen] = useState(false)
  const name = current?.club.name ?? ''

  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('header.switch', { name })}
        style={({ pressed }) => [styles.switch, pressed && styles.pressed]}>
        <Text variant="caption" tone={color.inkMuted} style={styles.eyebrow}>
          {t('header.eyebrow')}
        </Text>
        <View style={styles.nameRow}>
          <Text variant="display" numberOfLines={1} style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          <Ionicons name="chevron-down" size={22} color={color.inkMuted} />
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel={t('header.profile')}
        hitSlop={8}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
        <Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url} size={44} ring={color.lineStrong} />
      </Pressable>
      <ClubSwitcher visible={open} onClose={() => setOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switch: { flex: 1, minHeight: HIT, borderRadius: radius.md, paddingVertical: space.xs },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flexShrink: 1 },
  avatar: { minWidth: HIT, minHeight: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { opacity: 0.7 },
})
