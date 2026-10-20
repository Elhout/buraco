import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Screen, Segmented } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { Footnote } from '@/features/history/ui'
import { qk } from '@/lib/queryKeys'
import { useStatsLive } from './api'
import { H2HTab } from './H2HTab'
import { LeaderboardTab } from './LeaderboardTab'
import { MeTab } from './MeTab'
import { PairsTab } from './PairsTab'

type Tab = 'me' | 'leaderboard' | 'pairs' | 'h2h'

/** Stats tab: my stats, leaderboard, pairs and head-to-head; verified games in the current club only. */
export function StatsScreen() {
  const { t } = useTranslation(['stats', 'common'])
  const me = useUserId()
  const { club } = useCurrentClub()
  const client = useQueryClient()
  const { members, nameOf } = useClubMembers(club.id)
  const [tab, setTab] = useState<Tab>('me')
  const [refreshing, setRefreshing] = useState(false)
  useStatsLive(club.id)

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await client.invalidateQueries({ queryKey: qk.stats(club.id) })
    } finally {
      setRefreshing(false)
    }
  }

  const props = { clubId: club.id, me, nameOf }
  return (
    <Screen title={t('title')} subtitle={t('subtitle', { club: club.name })} refreshing={refreshing} onRefresh={() => void refresh()}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'me', label: t('tabs.me') },
          { value: 'leaderboard', label: t('tabs.leaderboard') },
          { value: 'pairs', label: t('tabs.pairs') },
          { value: 'h2h', label: t('tabs.h2h') },
        ]}
      />
      {tab === 'me' ? <MeTab {...props} /> : null}
      {tab === 'leaderboard' ? <LeaderboardTab {...props} seasonStart={club.season_start} /> : null}
      {tab === 'pairs' ? <PairsTab {...props} /> : null}
      {tab === 'h2h' ? <H2HTab {...props} members={members} /> : null}
      <Footnote>{t('footnote')}</Footnote>
    </Screen>
  )
}
