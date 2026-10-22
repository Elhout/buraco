import type { Team } from '@buraco/shared'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Banner, Button, Screen, SectionTitle, Stack, Text } from '@/components/ui'
import { BackButton } from '@/features/auth/screens/BackButton'
import { formatNumber } from '@/lib/format'
import { HIT, color, radius, space } from '@/theme/tokens'
import {
  addCutBonus,
  addRound,
  removeRound,
  editRound,
  newQuickGame,
  quickOutcome,
  quickTotals,
  renameTeam,
  roundRows,
  setTarget,
  undoLastRound,
} from './model'
import { QuickRoundList } from './QuickRoundList'
import { QuickRoundSheet } from './QuickRoundSheet'
import { NewGameSheet, RenameSheet, TargetSheet } from './QuickSheets'
import { QuickTeamCard } from './QuickTeamCard'
import { useQuickGame } from './useQuickGame'
import { useTeamLabel } from './useTeamLabel'

type Open =
  { kind: 'round'; editing: number | null; focus?: Team } | { kind: 'rename'; team: Team } | { kind: 'target' } | { kind: 'newGame' } | null

/**
 * /quick: a score calculator anyone can use without signing in. Two teams (names optional),
 * rounds with running totals, winner at the target. Saved only on this phone.
 */
export function QuickGameScreen() {
  const { t } = useTranslation('quick')
  const [game, setGame] = useQuickGame()
  const [open, setOpen] = useState<Open>(null)
  const label = useTeamLabel(game)
  const totals = quickTotals(game)
  const outcome = quickOutcome(game)
  const over = outcome.kind === 'won'
  const close = (): void => setOpen(null)

  const saveRound = (a: number, b: number, cut: Team | null): void => {
    if (open?.kind !== 'round') return
    const result = open.editing === null ? addRound(game, a, b, cut) : editRound(game, open.editing, a, b, cut)
    if (!result.ok) return
    setGame(result.game)
    if (quickOutcome(result.game).kind === 'won') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    close()
  }

  const startNew = (): void => {
    setGame(newQuickGame(game))
    close()
  }

  const footer = over ? (
    <Button label={t('newGame')} size="lg" block icon={<Ionicons name="refresh" size={20} color={color.onPrimary} />} onPress={startNew} />
  ) : (
    <Button
      label={t('addRound')}
      size="lg"
      block
      icon={<Ionicons name="add" size={22} color={color.onPrimary} />}
      onPress={() => setOpen({ kind: 'round', editing: null })}
    />
  )

  return (
    <Screen footer={footer}>
      <View style={styles.header}>
        <BackButton label={t('back')} fallback="/" />
        {game.rounds.length > 0 && !over ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('newGame')}
            onPress={() => setOpen({ kind: 'newGame' })}
            style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: color.raised }]}>
            <Ionicons name="refresh" size={22} color={color.ink} />
          </Pressable>
        ) : null}
      </View>
      <Stack gap={space.xs}>
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('subtitle')}
        </Text>
      </Stack>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen({ kind: 'target' })}
        style={({ pressed }) => [styles.chip, pressed && { backgroundColor: color.raised }]}>
        <Ionicons name="flag-outline" size={16} color={color.inkMuted} />
        <Text variant="label">{t('target', { points: formatNumber(game.target) })}</Text>
        <Ionicons name="pencil" size={14} color={color.inkFaint} />
      </Pressable>
      {outcome.kind === 'won' ? (
        <Banner tone="success">
          {`${t('won', { name: label(outcome.winner) })} · ${t('wonScore', {
            winner: formatNumber(totals[outcome.winner]),
            loser: formatNumber(totals[outcome.winner === 'A' ? 'B' : 'A']),
          })}`}
        </Banner>
      ) : outcome.kind === 'tie_at_target' ? (
        <Banner tone="warning">{t('tie')}</Banner>
      ) : null}
      <View style={styles.teams}>
        {(['A', 'B'] as const).map((team) => (
          <QuickTeamCard
            key={team}
            team={team}
            name={label(team)}
            total={totals[team]}
            target={game.target}
            leading={game.rounds.length > 0 && totals[team] > totals[team === 'A' ? 'B' : 'A']}
            onRename={() => setOpen({ kind: 'rename', team })}
            onAddRound={over ? undefined : () => setOpen({ kind: 'round', editing: null, focus: team })}
            onCut={
              over
                ? undefined
                : () => {
                    const result = addCutBonus(game, team)
                    if (!result.ok) return
                    void Haptics.selectionAsync()
                    setGame(result.game)
                  }
            }
          />
        ))}
      </View>
      <SectionTitle
        action={
          game.rounds.length > 0 ? (
            <Button
              label={t('undo')}
              variant="quiet"
              onPress={() => {
                void Haptics.selectionAsync()
                setGame(undoLastRound(game))
              }}
            />
          ) : undefined
        }>
        {t('rounds')}
      </SectionTitle>
      <QuickRoundList
        rows={roundRows(game)}
        onEdit={(index) => setOpen({ kind: 'round', editing: index })}
        onRemove={(index) => setGame(removeRound(game, index))}
      />

      {open?.kind === 'round' ? (
        <QuickRoundSheet game={game} editing={open.editing} focus={open.focus} onSave={saveRound} onClose={close} />
      ) : null}
      {open?.kind === 'rename' ? (
        <RenameSheet
          team={open.team}
          name={open.team === 'A' ? game.teamAName : game.teamBName}
          onSave={(name) => {
            setGame(renameTeam(game, open.team, name))
            close()
          }}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'target' ? (
        <TargetSheet
          target={game.target}
          onSave={(target) => {
            setGame(setTarget(game, target))
            close()
          }}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'newGame' ? <NewGameSheet onConfirm={startNew} onClose={close} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
  },
  teams: { flexDirection: 'row', gap: space.md },
})
