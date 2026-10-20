import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Button, ErrorText, Field, SectionTitle, TeamBadge, Text } from '@/components/ui'
import { type Member, useClubMembers } from '@/features/clubs/members'
import { sortByPresence } from '@/features/lobby/model'
import { HIT, color, radius, space } from '@/theme/tokens'
import { type Player, type Slots, nextFreeSeat, seatOf, teamOfSeat } from './draft'

export interface MemberPickerProps {
  clubId: string
  meId: string
  slots: Slots
  online: ReadonlySet<string>
  onToggle: (player: Player) => void
}

const asPlayer = (m: Member): Player => ({ kind: 'member', userId: m.userId, name: m.name })

function MemberRow({
  member,
  slots,
  online,
  isMe,
  onToggle,
}: {
  member: Member
  slots: Slots
  online: boolean
  isMe: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation(['lobby', 'common'])
  const seat = seatOf(slots, asPlayer(member))
  const blocked = seat === null && nextFreeSeat(slots) === null
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ selected: seat !== null, disabled: blocked }}
      accessibilityLabel={t(online ? 'online.label' : 'online.labelOffline', { name: member.name })}
      style={({ pressed }) => [styles.row, seat !== null && styles.rowSelected, blocked && styles.blocked, pressed && styles.pressed]}>
      <Avatar name={member.name} url={member.avatarUrl} size={40} online={online} />
      <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
        {isMe ? `${member.name} · ${t('common:you')}` : member.name}
      </Text>
      {seat !== null ? (
        <View style={styles.seated}>
          <TeamBadge team={teamOfSeat(seat)} />
        </View>
      ) : (
        <Ionicons name="add-circle-outline" size={26} color={blocked ? color.inkFaint : color.ink} />
      )}
    </Pressable>
  )
}

/** Searchable club members with presence dots; tap to seat or unseat. */
export function MemberPicker({ clubId, meId, slots, online, onToggle }: MemberPickerProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const { members, isPending, error, refetch } = useClubMembers(clubId)
  const [query, setQuery] = useState('')
  const q = query.trim().toLocaleLowerCase()
  const visible = sortByPresence(members, online, meId).filter((m) => q === '' || m.name.toLocaleLowerCase().includes(q))

  let list
  if (isPending) list = <ActivityIndicator color={color.inkMuted} style={styles.pad} />
  else if (error)
    list = (
      <View style={styles.error}>
        <Text variant="label" tone={color.inkMuted}>
          {t('online.loadError')}
        </Text>
        <ErrorText error={error} />
        <Button label={t('common:actions.retry')} variant="secondary" onPress={() => void refetch()} />
      </View>
    )
  else if (visible.length === 0)
    list = (
      <Text variant="body" tone={color.inkMuted} center style={styles.pad}>
        {t('new.noMatch', { query: query.trim() })}
      </Text>
    )
  else
    list = visible.map((m) => (
      <MemberRow
        key={m.userId}
        member={m}
        slots={slots}
        online={online.has(m.userId)}
        isMe={m.userId === meId}
        onToggle={() => onToggle(asPlayer(m))}
      />
    ))

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('new.members')}</SectionTitle>
      <Field
        label={t('new.search')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {list}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.sm },
  pad: { paddingVertical: space.lg },
  error: { gap: space.sm, alignItems: 'flex-start' },
  row: {
    minHeight: HIT + space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  rowSelected: { backgroundColor: color.raised },
  blocked: { opacity: 0.5 },
  pressed: { backgroundColor: color.raised },
  seated: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
})
