import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Banner, Button, EmptyState, ErrorText, Screen, Stack } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { useTournamentActions } from '@/features/tournament/actions'
import { useTournament } from '@/features/tournament/api'
import { BackButton } from '@/features/tournament/components/BackButton'
import { DetailTabs } from '@/features/tournament/components/DetailTabs'
import { ByeBanner, MyTableBanner } from '@/features/tournament/components/MyTableBanner'
import { OrganizerPanel } from '@/features/tournament/components/OrganizerPanel'
import { RoundClock } from '@/features/tournament/components/RoundClock'
import { TournamentHeader } from '@/features/tournament/components/TournamentHeader'
import { findMyTable, hasLiveBye, indexFor, liveRound, matchHref } from '@/features/tournament/model'
import type { TournamentData } from '@/features/tournament/types'
import { useConnectionAlert } from '@/lib/realtime'
import { color } from '@/theme/tokens'

/** Tournament detail: clock, my table, organizer controls, and Tables | Standings | Log. Live. */
export default function TournamentScreen() {
  const { t } = useTranslation(['tournament', 'common'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const { club } = useCurrentClub()
  const { data, isPending, error, refetch, isRefetching, realtime } = useTournament(id, club.id)
  const down = useConnectionAlert(realtime)

  if (isPending) {
    return (
      <Screen>
        <BackButton />
        <ActivityIndicator color={color.ink} accessibilityLabel={t('common:loading')} />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen>
        <BackButton />
        <EmptyState icon="alert-circle-outline" title={t('detail.notFound')} />
        <ErrorText error={error} />
        <Button variant="secondary" label={t('common:actions.retry')} onPress={() => void refetch()} />
      </Screen>
    )
  }
  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <BackButton />
      {down ? <Banner tone="danger">{t('common:connection.down')}</Banner> : null}
      <TournamentBody data={data} clubId={club.id} />
    </Screen>
  )
}

function TournamentBody({ data, clubId }: { data: TournamentData; clubId: string }) {
  const userId = useUserId()
  const { members, nameOf } = useClubMembers(clubId)
  const actions = useTournamentActions(data.tournament.id, clubId)
  const { tournament } = data
  const index = indexFor(data)
  const isOrganizer = tournament.organizer_id === userId
  const myEntryIds = new Set(data.entries.filter((e) => e.userId === userId).map((e) => e.id))
  const live = liveRound(data.rounds)
  const myTable = findMyTable(data, userId, index)

  return (
    <Stack gap={16}>
      <TournamentHeader tournament={tournament} organizerName={nameOf(tournament.organizer_id)} />
      {live && tournament.status === 'running' ? <RoundClock roundNo={live.round_no} endsAt={live.ends_at} /> : null}
      {myTable ? <MyTableBanner table={myTable} href={matchHref(myTable.match, myEntryIds)} /> : null}
      {live && hasLiveBye(data, userId, index) ? <ByeBanner roundNo={live.round_no} /> : null}
      {isOrganizer ? <OrganizerPanel data={data} index={index} members={members} actions={actions} /> : null}
      <DetailTabs
        data={data}
        index={index}
        userId={userId}
        isOrganizer={isOrganizer}
        myEntryIds={myEntryIds}
        nameOf={nameOf}
        editResult={actions.editResult}
      />
    </Stack>
  )
}
