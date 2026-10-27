import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Avatar, EmptyState, ErrorText, Screen, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { type Member, useClubMembers } from '@/features/clubs/members'
import { useOnlineMembers } from '@/features/lobby/presence'
import { formatNumber, formatTime } from '@/lib/format'
import { setChatOpen } from '@/lib/push'
import { HIT, color, font, radius, space } from '@/theme/tokens'
import { useChatMessages, useSendMessage } from './api'
import { type Bubble, toBubbles } from './model'

/** Chat tab: one group chat for the club, with who's online on top. */
export function ChatScreen() {
  const { t, i18n } = useTranslation('chat')
  const me = useUserId()
  const { club } = useCurrentClub()
  const members = useClubMembers(club.id)
  const online = useOnlineMembers(club.id)
  const messages = useChatMessages(club.id)
  const send = useSendMessage(club.id)
  const [draft, setDraft] = useState('')

  // While the chat is in front, the server skips chat pushes to this phone.
  useFocusEffect(
    useCallback(() => {
      setChatOpen(true)
      return () => setChatOpen(false)
    }, []),
  )

  const bubbles = toBubbles(messages.data ?? [], me)
  const others = members.members.filter((m) => m.userId !== me && online.has(m.userId))
  const body = draft.trim()
  const submit = (): void => {
    if (!body || send.isPending) return
    send.mutate(body, { onSuccess: () => setDraft('') })
  }

  return (
    <Screen title={t('title')} scroll={false} contentStyle={styles.content}>
      <OnlineStrip people={others} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={64}>
        {messages.isPending ? (
          <ActivityIndicator color={color.inkMuted} style={styles.flex} />
        ) : messages.isError ? (
          <View style={styles.flex}>
            <Text variant="bodyStrong">{t('loadError')}</Text>
            <ErrorText error={messages.error} />
          </View>
        ) : (
          <FlatList
            style={styles.flex}
            data={bubbles}
            inverted={bubbles.length > 0}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => (
              <MessageBubble bubble={item} name={item.mine ? t('you') : members.nameOf(item.userId)} lang={i18n.language} />
            )}
            ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={t('empty')} body={t('emptyBody')} />}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}
        <ErrorText error={send.error} />
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('placeholder')}
            placeholderTextColor={color.inkFaint}
            selectionColor={color.accent}
            multiline
            maxLength={1000}
            style={styles.input}
            accessibilityLabel={t('placeholder')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            disabled={!body || send.isPending}
            onPress={submit}
            style={({ pressed }) => [styles.send, (!body || send.isPending) && styles.sendOff, pressed && styles.pressed]}>
            {send.isPending ? (
              <ActivityIndicator color={color.onPrimary} />
            ) : (
              <Ionicons name={I18nManager.isRTL ? 'arrow-back' : 'arrow-forward'} size={22} color={color.onPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/** Other members with the app open right now. */
function OnlineStrip({ people }: { people: readonly Member[] }) {
  const { t } = useTranslation('chat')
  return (
    <View style={styles.online}>
      <View style={styles.onlineHead}>
        <View style={[styles.dot, { backgroundColor: people.length > 0 ? color.success : color.inkFaint }]} />
        <Text variant="caption" tone={color.inkMuted}>
          {people.length > 0 ? t('online', { count: people.length, n: formatNumber(people.length) }) : t('onlineNone')}
        </Text>
      </View>
      {people.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onlineList}>
          {people.map((p) => (
            <View key={p.userId} style={styles.person}>
              <Avatar name={p.name} url={p.avatarUrl} size={40} online />
              <Text variant="caption" numberOfLines={1} style={styles.personName}>
                {p.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

function MessageBubble({ bubble, name, lang }: { bubble: Bubble; name: string; lang: string }) {
  return (
    <View style={[styles.item, bubble.mine ? styles.itemMine : styles.itemOther, bubble.startsRun && styles.itemRunStart]}>
      {bubble.startsRun ? (
        <Text variant="caption" tone={color.inkFaint} style={bubble.mine ? styles.metaMine : undefined}>
          {bubble.mine ? formatTime(bubble.createdAt, lang) : `${name} · ${formatTime(bubble.createdAt, lang)}`}
        </Text>
      ) : null}
      <View style={[styles.bubble, bubble.mine ? styles.bubbleMine : styles.bubbleOther]}>
        <Text variant="body" tone={bubble.mine ? color.onPrimary : color.ink} selectable>
          {bubble.body}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: space.sm, gap: space.md },
  online: { gap: space.sm },
  onlineHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  onlineList: { gap: space.md },
  person: { width: 56, alignItems: 'center', gap: space.xxs },
  personName: { maxWidth: 56 },
  list: { paddingVertical: space.sm, flexGrow: 1 },
  item: { maxWidth: '82%', gap: space.xxs, marginTop: space.xxs },
  itemMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  itemOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  itemRunStart: { marginTop: space.md },
  metaMine: { textAlign: 'right' },
  bubble: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: color.primary, borderBottomEndRadius: radius.sm },
  bubbleOther: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderBottomStartRadius: radius.sm,
  },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingTop: space.sm },
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
