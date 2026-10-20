import { Ionicons } from '@expo/vector-icons'
import { router, useIsFocused } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Button, Card, EmptyState, ErrorText, Screen, SectionTitle, Text } from '@/components/ui'
import { useSession, useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { ClubHeader } from '@/features/lobby/ClubHeader'
import { GameCard } from '@/features/lobby/GameCard'
import { NeedsMe } from '@/features/lobby/NeedsMe'
import { WebPushCard } from '@/features/profile/WebPushCard'
import { OnlineStrip } from '@/features/lobby/OnlineStrip'
import { type UseLobbyResult, useLobby } from '@/features/lobby/api'
import { useClubPresence } from '@/features/lobby/presence'
import { color, space } from '@/theme/tokens'

function PlayingNow({ lobby, watch }: { lobby: UseLobbyResult; watch: boolean }) {
  const { t } = useTranslation(['lobby', 'common'])
  let body
  if (lobby.isPending) {
    body = (
      <Card tone="sunken" style={styles.center}>
        <ActivityIndicator color={color.inkMuted} />
      </Card>
    )
  } else if (lobby.error) {
    body = (
      <Card tone="sunken" style={styles.center}>
        <Text variant="bodyStrong">{t('playing.loadError')}</Text>
        <ErrorText error={lobby.error} />
        <Button label={t('common:actions.retry')} variant="secondary" onPress={lobby.refetch} />
      </Card>
    )
  } else if (lobby.games.length === 0) {
    body = (
      <Card tone="sunken">
        <EmptyState icon="layers-outline" title={t('playing.emptyTitle')} body={t('playing.emptyBody')} />
      </Card>
    )
  } else {
    body = lobby.games.map((g) => <GameCard key={g.id} game={g} watch={watch} />)
  }
  return (
    <View style={styles.section}>
      <SectionTitle>{t('playing.title')}</SectionTitle>
      {body}
    </View>
  )
}

/** Club tab: who's playing now, what needs me, who's online, and the New game button. */
export default function LobbyScreen() {
  const { t } = useTranslation(['lobby', 'common'])
  const userId = useUserId()
  const { profile } = useSession()
  const { club } = useCurrentClub()
  const focused = useIsFocused()
  const lobby = useLobby(club.id, userId)
  const online = useClubPresence(club.id, userId, profile?.display_name ?? '')
  const invites = lobby.games.filter((g) => g.myInvite)

  const footer = (
    <View style={styles.footer}>
      <Button
        label={t('newGame')}
        size="lg"
        block
        icon={<Ionicons name="add" size={24} color={color.inkOnLight} />}
        onPress={() => router.push('/game/new')}
      />
    </View>
  )

  return (
    <Screen footer={footer} refreshing={lobby.isRefetching} onRefresh={lobby.refetch}>
      <ClubHeader />
      <WebPushCard />
      <NeedsMe invites={invites} toVerify={lobby.toVerify} />
      <PlayingNow lobby={lobby} watch={focused} />
      <OnlineStrip clubId={club.id} userId={userId} online={online} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  center: { alignItems: 'center', paddingVertical: space.xl },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    backgroundColor: color.felt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
})
