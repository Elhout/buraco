import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented, Stack } from '@/components/ui'
import type { useTournamentActions } from '../actions'
import { logItems } from '../events'
import { isClosed, roundGroups } from '../model'
import { myUnitOf, standingRows } from '../standings'
import type { MatchView, TournamentData } from '../types'
import type { UnitIndex } from '../units'
import { EditResultSheet } from './EditResultSheet'
import { LogTab } from './LogTab'
import { StandingsTab } from './StandingsTab'
import { TablesTab } from './TablesTab'

type Tab = 'tables' | 'standings' | 'log'

export interface DetailTabsProps {
  data: TournamentData
  index: UnitIndex
  userId: string
  isOrganizer: boolean
  myEntryIds: ReadonlySet<string>
  nameOf: (userId: string) => string
  editResult: ReturnType<typeof useTournamentActions>['editResult']
}

/** Tables | Standings | Log, plus the organizer's edit-result sheet opened from a table. */
export function DetailTabs({ data, index, userId, isOrganizer, myEntryIds, nameOf, editResult }: DetailTabsProps) {
  const { t } = useTranslation('tournament')
  const [tab, setTab] = useState<Tab>('tables')
  const [editing, setEditing] = useState<MatchView | null>(null)
  const { tournament } = data
  const canEdit = isOrganizer && !isClosed(tournament.status)
  const closeEdit = () => {
    setEditing(null)
    editResult.reset()
  }
  const myUnit = myUnitOf(data.entries, userId, tournament.pairing)

  return (
    <Stack gap={16}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tables', label: t('detail.tabs.tables') },
          { value: 'standings', label: t('detail.tabs.standings') },
          { value: 'log', label: t('detail.tabs.log') },
        ]}
      />
      {tab === 'tables' ? (
        <TablesTab
          groups={roundGroups(data.rounds, data.matches)}
          index={index}
          myEntryIds={myEntryIds}
          isDraft={tournament.status === 'draft'}
          onEdit={canEdit ? setEditing : null}
        />
      ) : null}
      {tab === 'standings' ? (
        <StandingsTab
          rows={standingRows({ index, matches: data.matches, rounds: data.rounds, myUnit })}
          matches={data.matches}
          index={index}
          name={tournament.name}
        />
      ) : null}
      {tab === 'log' ? <LogTab items={logItems(data.events, { nameOfUser: nameOf, matches: data.matches })} /> : null}
      {editing && canEdit ? (
        <EditResultSheet
          key={editing.matchId}
          match={editing}
          index={index}
          allowDraw={tournament.format !== 'knockout'}
          busy={editResult.isPending}
          error={editResult.error}
          onClose={closeEdit}
          onSave={(input) => editResult.mutate(input, { onSuccess: closeEdit })}
        />
      ) : null}
    </Stack>
  )
}
