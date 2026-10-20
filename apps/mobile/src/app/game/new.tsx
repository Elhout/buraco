import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Banner, Button, ErrorText, Screen, Segmented, Stack, Text } from '@/components/ui'
import { useSession, useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { type DraftIssue, type GameMode, filledCount } from '@/features/game/new/draft'
import { GuestField } from '@/features/game/new/GuestField'
import { MemberPicker } from '@/features/game/new/MemberPicker'
import { TeamPanels } from '@/features/game/new/TeamPanels'
import { type NewGameState, useNewGame } from '@/features/game/new/useNewGame'
import { useOnlineMembers } from '@/features/lobby/presence'
import { HIT, color, radius, space } from '@/theme/tokens'

function CloseButton() {
  const { t } = useTranslation(['lobby', 'common'])
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={t('new.close')}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Ionicons name="close" size={24} color={color.ink} />
    </Pressable>
  )
}

function ModePicker({ mode, onChange }: { mode: GameMode; onChange: (m: GameMode) => void }) {
  const { t } = useTranslation(['lobby', 'common'])
  return (
    <Stack gap={space.sm}>
      <Text variant="bodyStrong">{t('new.mode')}</Text>
      <Segmented
        value={mode}
        onChange={onChange}
        options={[
          { value: 'normal', label: t('common:mode.normal') },
          { value: 'ghost', label: t('common:mode.ghost') },
        ]}
      />
      <Text variant="label" tone={mode === 'ghost' ? color.ghost : color.inkMuted}>
        {mode === 'ghost' ? t('new.ghostHint') : t('new.normalHint')}
      </Text>
    </Stack>
  )
}

/** The first problem worth telling the user about; "pick N more" is handled by the button hint. */
const firstIssue = (issues: readonly DraftIssue[]): Exclude<DraftIssue, 'needFour'> | null =>
  (issues.find((i) => i !== 'needFour') as Exclude<DraftIssue, 'needFour'> | undefined) ?? null

function StartBar({ state }: { state: NewGameState }) {
  const { t } = useTranslation(['lobby', 'common'])
  const missing = 4 - filledCount(state.slots)
  const issue = firstIssue(state.issues)
  const hint = issue ? t(`new.issue.${issue}`) : missing > 0 ? t('new.playersLeft', { count: missing }) : null
  return (
    <View style={styles.footer}>
      {hint ? (
        <Text variant="label" tone={issue ? color.warning : color.inkMuted} center accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
      <ErrorText error={state.startError} />
      <Button
        label={state.mode === 'ghost' ? t('new.startGhost') : t('new.start')}
        size="lg"
        block
        loading={state.starting}
        disabled={state.issues.length > 0}
        onPress={state.start}
        icon={<Ionicons name={state.mode === 'ghost' ? 'flash' : 'paper-plane'} size={20} color={color.onPrimary} />}
      />
    </View>
  )
}

/** /game/new (modal): pick four players, seat them in teams, choose verified or ghost, start. */
export default function NewGameScreen() {
  const { t } = useTranslation(['lobby', 'common'])
  const userId = useUserId()
  const { profile } = useSession()
  const { club } = useCurrentClub()
  const online = useOnlineMembers(club.id)
  const state = useNewGame(club.id, { kind: 'member', userId, name: profile?.display_name ?? '' })

  return (
    <Screen
      title={t('new.title')}
      subtitle={t('new.subtitle')}
      actions={<CloseButton />}
      edges={['top', 'bottom']}
      footer={<StartBar state={state} />}>
      <TeamPanels slots={state.slots} meId={userId} onClear={state.clear} onSwap={state.swap} onShuffle={state.reshuffle} />
      <ModePicker mode={state.mode} onChange={state.setMode} />
      {state.guestsDropped ? <Banner tone="ghost">{t('new.guestsDropped')}</Banner> : null}
      {state.mode === 'ghost' ? <GuestField slots={state.slots} onAdd={state.toggle} /> : null}
      <MemberPicker clubId={club.id} meId={userId} slots={state.slots} online={online} onToggle={state.toggle} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  close: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.raised,
  },
  pressed: { opacity: 0.7 },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
})
