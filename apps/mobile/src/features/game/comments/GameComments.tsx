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

/** Comments on a game, while it is played and later from the history. Any club member can write. */
export function GameComments({ gameId }: { gameId: string }) {
  const { t, i18n } = useTranslation('game')
  const me = useUserId()
  const { club } = useCurrentClub()
  const { members } = useClubMembers(club.id)
  const comments = useGameComments(gameId)
  const add = useAddComment(gameId)
  const [draft, setDraft] = useState('')
  const byId = new Map(members.map((m) => [m.userId, m]))
  const body = draft.trim()
  const send = (): void => {
    if (!body || add.isPending) return
    add.mutate(body, { onSuccess: () => setDraft('') })
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
                {c.body}
              </Text>
            </View>
          </View>
        )
      })}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('comments.placeholder')}
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
