import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, Button, ErrorText, SectionTitle, Text } from '@/components/ui'
import { useClubMembers } from '@/features/clubs/members'
import { color, space } from '@/theme/tokens'
import { sortByPresence } from './model'

export interface OnlineStripProps {
  clubId: string
  userId: string
  online: ReadonlySet<string>
}

/** Club members as a swipeable strip, online first, with green/grey presence dots. */
export function OnlineStrip({ clubId, userId, online }: OnlineStripProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const { members, isPending, error, refetch } = useClubMembers(clubId)
  const sorted = sortByPresence(members, online, userId)
  const others = members.filter((m) => m.userId !== userId && online.has(m.userId)).length

  const body = isPending ? (
    <ActivityIndicator color={color.inkMuted} style={styles.loading} />
  ) : error ? (
    <View style={styles.error}>
      <Text variant="label" tone={color.inkMuted}>
        {t('online.loadError')}
      </Text>
      <ErrorText error={error} />
      <Button label={t('common:actions.retry')} variant="secondary" onPress={() => void refetch()} />
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {sorted.map((m) => {
        const isOnline = online.has(m.userId)
        return (
          <View
            key={m.userId}
            style={styles.member}
            accessible
            accessibilityLabel={t(isOnline ? 'online.label' : 'online.labelOffline', { name: m.name })}>
            <Avatar name={m.name} url={m.avatarUrl} size={48} online={isOnline} ring={m.userId === userId ? color.primary : undefined} />
            <Text variant="caption" numberOfLines={1} center tone={isOnline ? color.ink : color.inkFaint}>
              {m.userId === userId ? t('common:you') : (m.name.split(' ')[0] ?? m.name)}
            </Text>
          </View>
        )
      })}
    </ScrollView>
  )

  return (
    <View style={styles.wrap}>
      <SectionTitle
        action={
          <Text variant="caption" tone={others > 0 ? color.success : color.inkFaint}>
            {others > 0 ? t('online.count', { count: others }) : t('online.nobody')}
          </Text>
        }>
        {t('online.title')}
      </SectionTitle>
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  loading: { paddingVertical: space.lg },
  error: { gap: space.sm, alignItems: 'flex-start' },
  strip: { gap: space.md, paddingVertical: space.xs },
  member: { width: 64, alignItems: 'center', gap: space.xs },
})
