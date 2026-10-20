import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Avatar, ListRow, SectionTitle, Stack, Text } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { color } from '@/theme/tokens'
import { type SetupDraft, entrantCount, toggleMember } from '../../setup'
import { GhostSeats } from './GhostSeats'
import { PairsEditor } from './PairsEditor'

export interface EntrantsSectionProps {
  draft: SetupDraft
  pending: string | null
  members: readonly Member[]
  loading: boolean
  nameOf: (userId: string) => string
  onChange: (draft: SetupDraft, pending: string | null) => void
}

/** Pick club members, then pair them (fixed) or fill tables with ghost seats (rotating). */
export function EntrantsSection({ draft, pending, members, loading, nameOf, onChange }: EntrantsSectionProps) {
  const { t } = useTranslation('tournament')
  const toggle = (userId: string) => onChange(toggleMember(draft, userId), pending === userId ? null : pending)

  return (
    <Stack gap={12}>
      <SectionTitle>{t('create.entrants')}</SectionTitle>
      <Text variant="label" tone={color.inkMuted}>
        {t('create.entrantCount', { count: entrantCount(draft) })}
      </Text>
      {draft.pairing === 'fixed' && draft.selected.length > 0 ? (
        <PairsEditor draft={draft} pending={pending} nameOf={nameOf} onChange={onChange} />
      ) : null}
      {draft.pairing === 'rotating' ? <GhostSeats draft={draft} onChange={(next) => onChange(next, pending)} /> : null}

      <SectionTitle>{t('create.addMembers')}</SectionTitle>
      {loading ? <ActivityIndicator color={color.ink} /> : null}
      {!loading && members.length === 0 ? (
        <Text variant="body" tone={color.inkMuted}>
          {t('create.noMembers')}
        </Text>
      ) : null}
      {members.map((m) => {
        const on = draft.selected.includes(m.userId)
        return (
          <ListRow
            key={m.userId}
            title={m.name}
            leading={<Avatar name={m.name} url={m.avatarUrl} size={36} />}
            trailing={
              <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={on ? color.success : color.inkFaint} />
            }
            onPress={() => toggle(m.userId)}
          />
        )
      })}
    </Stack>
  )
}
