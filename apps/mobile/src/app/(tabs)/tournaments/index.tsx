import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Button, EmptyState, ErrorText, Screen, Stack } from '@/components/ui'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useTournaments } from '@/features/tournament/api'
import { TournamentCard } from '@/features/tournament/components/TournamentCard'
import { color } from '@/theme/tokens'

/** Tournaments tab: the club's events, live. Only owners and admins may organize one. */
export default function TournamentsScreen() {
  const { t } = useTranslation(['tournament', 'common'])
  const { club, role } = useCurrentClub()
  const canOrganize = role === 'owner' || role === 'admin'
  const { data, isPending, error, refetch, isRefetching } = useTournaments(club.id)
  const create = () => router.push('/tournaments/new')

  return (
    <Screen
      title={t('list.title')}
      subtitle={club.name}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      actions={
        canOrganize && (data?.length ?? 0) > 0 ? (
          <Button label={t('list.new')} onPress={create} icon={<Ionicons name="add" size={18} color={color.onPrimary} />} />
        ) : null
      }>
      {isPending ? <ActivityIndicator color={color.ink} accessibilityLabel={t('common:loading')} /> : null}
      {error ? (
        <Stack>
          <ErrorText error={error} />
          <Button variant="secondary" label={t('common:actions.retry')} onPress={() => void refetch()} />
        </Stack>
      ) : null}
      {data && data.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title={t('list.emptyTitle')}
          body={canOrganize ? t('list.emptyBody') : t('list.emptyBodyMember')}
          action={canOrganize ? <Button label={t('list.new')} size="lg" onPress={create} /> : undefined}
        />
      ) : null}
      {data?.map((tournament) => (
        <TournamentCard key={tournament.id} tournament={tournament} onPress={() => router.push(`/tournaments/${tournament.id}`)} />
      ))}
    </Screen>
  )
}
