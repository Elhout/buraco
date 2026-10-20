import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, ListRow, SectionTitle } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import type { GhostToVerify } from './api'
import type { LobbyGame } from './model'

function Icon({ name, tone, bg }: { name: keyof typeof Ionicons.glyphMap; tone: string; bg: string }) {
  return (
    <View style={[styles.icon, { backgroundColor: bg }]}>
      <Ionicons name={name} size={22} color={tone} />
    </View>
  )
}

/** "Waiting for you": my open invites and ghost games my PIN can verify. Hidden when empty. */
export function NeedsMe({ invites, toVerify }: { invites: readonly LobbyGame[]; toVerify: readonly GhostToVerify[] }) {
  const { t, i18n } = useTranslation(['lobby', 'common'])
  if (invites.length === 0 && toVerify.length === 0) return null
  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('needs.title')}</SectionTitle>
      <Card tone="raised" accent={color.warning} style={styles.card}>
        {invites.map((g) => (
          <ListRow
            key={g.id}
            title={t('needs.invite', { host: g.hostName })}
            subtitle={t('needs.inviteBody')}
            leading={<Icon name="mail-unread-outline" tone={color.warning} bg={color.surface} />}
            onPress={() => router.push(`/game/${g.id}/invite`)}
          />
        ))}
        {toVerify.map((v) => (
          <ListRow
            key={v.gameId}
            title={t('needs.verify')}
            subtitle={v.finishedAt ? t('needs.verifyBody', { date: formatDate(v.finishedAt, i18n.language) }) : t('needs.verifyNoDate')}
            leading={<Icon name="eye-off-outline" tone={color.ghost} bg={color.ghostSoft} />}
            onPress={() => router.push(`/history/${v.gameId}`)}
          />
        ))}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  card: { paddingVertical: space.xs, paddingStart: space.xl, gap: 0 },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
})
