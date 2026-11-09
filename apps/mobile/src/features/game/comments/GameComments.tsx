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
import { useAddComment, useGameComments, useGameReactions, useToggleReaction } from './api'
import { LIKE, REACTIONS, type Reaction, countReactions } from './reactions'
import { type Picked, insertMention, mentionQuery, mentionedIds, splitMentions } from './mentions'
import { matchesName } from '@/features/players/roster'

/** Comments on a game, while it is played and later from the history. Any club member can write. */
export function GameComments({ gameId }: { gameId: string }) {
  const { t, i18n } = useTranslation('game')
  const me = useUserId()
  const { club } = useCurrentClub()
  const { members } = useClubMembers(club.id)
  const comments = useGameComments(gameId)
  const reactions = useGameReactions(gameId)
  const toggle = useToggleReaction(gameId)
  const [picking, setPicking] = useState<string | null>(null)
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
                  (c.mentions ?? []).map((id) => byId.get(id)?.name ?? ''),
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
              <ReactionBar
                counts={countReactions(reactions.data ?? [], c.id, me)}
                picking={picking === c.id}
                onToggle={(emoji) => {
                  toggle.mutate({ commentId: c.id, emoji })
                  setPicking(null)
                }}
                onPick={() => setPicking(picking === c.id ? null : c.id)}
              />
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

/** ❤️ like, the reactions so far (mine highlighted, tap to take back) and ☺+ for the other emojis. */
function ReactionBar({
  counts,
  picking,
  onToggle,
  onPick,
}: {
  counts: readonly { emoji: Reaction; count: number; mine: boolean }[]
  picking: boolean
  onToggle: (emoji: Reaction) => void
  onPick: () => void
}) {
  const { t } = useTranslation('game')
  const liked = counts.some((c) => c.emoji === LIKE && c.mine)
  return (
    <View style={styles.reactions}>
      <View style={styles.reactionRow}>
        {liked ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('comments.like')}
            onPress={() => onToggle(LIKE)}
            hitSlop={6}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Ionicons name="heart-outline" size={16} color={color.inkMuted} />
          </Pressable>
        )}
        {counts.map((c) => (
          <Pressable
            key={c.emoji}
            accessibilityRole="button"
            accessibilityState={{ selected: c.mine }}
            accessibilityLabel={t('comments.reactionA11y', { emoji: c.emoji, count: c.count })}
            onPress={() => onToggle(c.emoji)}
            hitSlop={4}
            style={({ pressed }) => [styles.chip, c.mine && styles.chipMine, pressed && styles.pressed]}>
            <Text variant="label">{`${c.emoji} ${c.count}`}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.react')}
          onPress={onPick}
          hitSlop={6}
          style={({ pressed }) => [styles.chip, picking && styles.chipMine, pressed && styles.pressed]}>
          <Ionicons name="happy-outline" size={16} color={color.inkMuted} />
          <Ionicons name="add" size={12} color={color.inkMuted} />
        </Pressable>
      </View>
      {picking ? (
        <View style={styles.picker}>
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={emoji}
              onPress={() => onToggle(emoji)}
              style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
              <Text style={styles.pickEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  reactions: { gap: space.xs, marginTop: space.xxs },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  chipMine: { backgroundColor: color.raised, borderColor: color.accent },
  picker: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  pick: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pickEmoji: { fontSize: 22, lineHeight: 28 },
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
