import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { Avatar, Banner, Button, ErrorText, ListRow, SectionTitle, Sheet, Stack, Text } from '@/components/ui'
import type { Member } from '@/features/clubs/members'
import { color } from '@/theme/tokens'
import type { EntryView } from '../types'

export interface SubstituteSheetProps {
  visible: boolean
  onClose: () => void
  entries: readonly EntryView[]
  members: readonly Member[]
  busy: boolean
  error: unknown
  onSubstitute: (entryId: string, userId: string) => void
}

/** Late arrival: pick the entry that leaves, then the member who takes the seat. */
export function SubstituteSheet({ visible, onClose, entries, members, busy, error, onSubstitute }: SubstituteSheetProps) {
  const { t } = useTranslation(['tournament', 'common'])
  const [entryId, setEntryId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const entered = new Set(entries.flatMap((e) => (e.userId ? [e.userId] : [])))
  const free = members.filter((m) => !entered.has(m.userId))
  const leaving = entries.find((e) => e.id === entryId)
  const joining = free.find((m) => m.userId === userId)
  const close = () => {
    setEntryId(null)
    setUserId(null)
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={close} locked={busy} title={t('substitute.title')}>
      <ScrollView style={styles.list}>
        {!leaving ? (
          <Stack gap={4}>
            <SectionTitle>{t('substitute.pickEntry')}</SectionTitle>
            {entries.map((e) => (
              <ListRow
                key={e.id}
                title={e.name || t('common:guest')}
                leading={<Avatar name={e.name || '?'} size={32} />}
                onPress={() => setEntryId(e.id)}
              />
            ))}
          </Stack>
        ) : !joining ? (
          <Stack gap={4}>
            <SectionTitle action={<Button variant="quiet" label={t('substitute.change')} onPress={() => setEntryId(null)} />}>
              {t('substitute.pickMember')}
            </SectionTitle>
            {free.length === 0 ? <Text tone={color.inkMuted}>{t('substitute.noFreeMembers')}</Text> : null}
            {free.map((m) => (
              <ListRow
                key={m.userId}
                title={m.name}
                leading={<Avatar name={m.name} url={m.avatarUrl} size={32} />}
                onPress={() => setUserId(m.userId)}
              />
            ))}
          </Stack>
        ) : (
          <Banner tone="warning">{t('substitute.consequence', { from: leaving.name || t('common:guest'), to: joining.name })}</Banner>
        )}
      </ScrollView>
      <ErrorText error={error} />
      {leaving && joining ? (
        <Stack gap={8}>
          <Button size="lg" block loading={busy} label={t('substitute.confirm')} onPress={() => onSubstitute(leaving.id, joining.userId)} />
          <Button variant="quiet" block disabled={busy} label={t('substitute.change')} onPress={() => setUserId(null)} />
        </Stack>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  list: { maxHeight: 420 },
})
