import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, I18nManager, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Avatar, Card, ErrorText, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { gameDateTime } from '@/lib/gameWhen'
import { HIT, color, font, radius, space } from '@/theme/tokens'
import { useAddComment, useGameComments } from './api'
import { type Picked, insertMention, mentionQuery, mentionedIds, splitMentions } from './mentions'
import { matchesName } from '@/features/players/roster'

/** Comments on a game, while it is played and later from the history. Any club member can write. */
export function GameComments({ gameId }: { gameId: string }) {
  const { t, i18n } = useTranslation('game')
  const me = useUserId()
  const { club } = useCurrentClub()
  const { members } = useClubMembers(club.id)
  const comments = useGameComments(gameId)
  const add = useAddComment(gameId)
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<readonly Picked[]>([])
  const byId = new Map(members.map((m) => [m.userId, m]))
  const body = draft.trim()
  // Typing "@" + letters suggests members; picking one inserts "@Name" and remembers who it is.
  const query = mentionQuery(draft)
  const suggestions = query === null ? [] : members.filter((m) => m.userId !== me && matchesName(m.name, query)).slice(0, 5)
  const send = (): void => {
    if (!body || add.isPending) return
    add.mutate(
      { body, mentions: mentionedIds(body, picked) },
      {
        onSuccess: () => {
          setDraft('')
          setPicked([])
        },
      },
    )
  }
  const list = comments.data ?? []

  return (
    <Card style={styles.card}>
      <Text variant="label" tone={color.inkMuted}>
        {list.length > 0 ? t('comments.titleCount', { n: list.length }) : t('comments.title')}
      </Text>
      {comments.isPending ? <ActivityIndicator color={color.inkMuted} /> : null}
      <ErrorText error={comments.error} />
      {!comments.isPending && list.length === 0 ? (
        <Text variant="caption" tone={color.inkFaint}>
          {t('comments.empty')}
        </Text>
      ) : null}
      {list.map((c) => {
        const who = byId.get(c.user_id)
        return (
          <View key={c.id} style={styles.comment}>
            <Avatar name={who?.name ?? '?'} url={who?.avatarUrl} size={32} />
            <View style={styles.flex}>
              <Text variant="caption" tone={color.inkMuted}>
                {`${c.user_id === me ? t('comments.you') : (who?.name ?? '—')} · ${gameDateTime(c.created_at, i18n.language)}`}
              </Text>
              <Text variant="body" selectable>
                {splitMentions(
                  c.body,
                  c.mentions.map((id) => byId.get(id)?.name ?? ''),
                ).map((seg, i) =>
                  seg.mention ? (
                    <Text key={i} variant="bodyStrong" tone={color.accent}>
                      {seg.text}
                    </Text>
                  ) : (
                    seg.text
                  ),
                )}
              </Text>
            </View>
          </View>
        )
      })}
      {suggestions.length > 0 ? (
        <View style={styles.suggestions} accessibilityLabel={t('comments.mentionHint')}>
          {suggestions.map((m) => (
            <Pressable
              key={m.userId}
              accessibilityRole="button"
              onPress={() => {
                setDraft(insertMention(draft, m.name))
                setPicked((p) => [...p, { userId: m.userId, name: m.name }])
              }}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
              <Avatar name={m.name} url={m.avatarUrl} size={28} />
              <Text variant="label" numberOfLines={1} style={styles.flex}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('comments.placeholderMention')}
          placeholderTextColor={color.inkFaint}
          selectionColor={color.accent}
          multiline
          maxLength={500}
          style={styles.input}
          accessibilityLabel={t('comments.placeholder')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.send')}
          disabled={!body || add.isPending}
          onPress={send}
          style={({ pressed }) => [styles.send, (!body || add.isPending) && styles.sendOff, pressed && styles.pressed]}>
          {add.isPending ? (
            <ActivityIndicator color={color.onPrimary} />
          ) : (
            <Ionicons name={I18nManager.isRTL ? 'arrow-back' : 'arrow-forward'} size={20} color={color.onPrimary} />
          )}
        </Pressable>
      </View>
      <ErrorText error={add.error} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  flex: { flex: 1, gap: space.xxs },
  comment: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  suggestions: { borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: HIT },
  input: {
    flex: 1,
    minHeight: HIT,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    color: color.ink,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  send: { width: HIT, height: HIT, borderRadius: HIT / 2, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
})
