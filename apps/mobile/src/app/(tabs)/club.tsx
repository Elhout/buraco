import { Ionicons } from '@expo/vector-icons'
import { router, useIsFocused } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Button, Card, ErrorText, Screen, SectionTitle, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { GameCard } from '@/features/lobby/GameCard'
import { type UseLobbyResult, useLobby } from '@/features/lobby/api'
import { WebPushCard } from '@/features/profile/WebPushCard'
import { HIT, color, elevation, radius, space } from '@/theme/tokens'

/** Games in progress in the club; nothing at all when there are none (the big button says it all). */
function PlayingNow({ lobby, watch }: { lobby: UseLobbyResult; watch: boolean }) {
  const { t } = useTranslation(['lobby', 'common'])
  if (lobby.isPending) return <ActivityIndicator color={color.inkMuted} />
  if (lobby.error) {
    return (
      <Card>
        <Text variant="bodyStrong">{t('playing.loadError')}</Text>
        <ErrorText error={lobby.error} />
        <Button label={t('common:actions.retry')} variant="secondary" onPress={lobby.refetch} />
      </Card>
    )
  }
  if (lobby.games.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>{t('playing.title')}</SectionTitle>
      {lobby.games.map((g) => (
        <GameCard key={g.id} game={g} watch={watch} />
      ))}
    </View>
  )
}

/** A big tappable tile: icon, title and one line of explanation. */
function Tile({ icon, title, body, primary, onPress }: TileProps) {
  const fg = primary ? color.onPrimary : color.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, primary ? styles.tilePrimary : styles.tileSecondary, pressed && styles.pressed]}>
      <View style={[styles.tileIcon, { backgroundColor: primary ? 'rgba(255,255,255,0.14)' : color.raised }]}>
        <Ionicons name={icon} size={26} color={primary ? color.onPrimary : color.teamA} />
      </View>
      <View style={styles.tileText}>
        <Text variant="title" tone={fg}>
          {title}
        </Text>
        <Text variant="label" tone={primary ? fg : color.inkMuted}>
          {body}
        </Text>
      </View>
    </Pressable>
  )
}

interface TileProps {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  primary?: boolean
  onPress: () => void
}

/** Play tab (/club): start a game, the quick calculator, and the games being played right now. */
export default function PlayScreen() {
  const { t } = useTranslation(['lobby', 'common'])
  const userId = useUserId()
  const { club } = useCurrentClub()
  const focused = useIsFocused()
  const lobby = useLobby(club.id, userId)

  return (
    <Screen refreshing={lobby.isRefetching} onRefresh={lobby.refetch}>
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
          {t('common:appName')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:settings')}
          onPress={() => router.push('/profile')}
          hitSlop={8}
          style={({ pressed }) => [styles.gear, pressed && styles.pressed]}>
          <Ionicons name="settings-outline" size={24} color={color.ink} />
        </Pressable>
      </View>
      <Tile icon="play" title={t('home.newGame')} body={t('home.newGameBody')} primary onPress={() => router.push('/game/new')} />
      <Tile icon="calculator-outline" title={t('home.quick')} body={t('home.quickBody')} onPress={() => router.push('/quick')} />
      <WebPushCard />
      <PlayingNow lobby={lobby} watch={focused} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  gear: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  section: { gap: space.md },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg, minHeight: 92 },
  tilePrimary: { backgroundColor: color.primary, ...elevation.card },
  tileSecondary: { backgroundColor: color.surface, ...elevation.card },
  tileIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: space.xxs },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
})
