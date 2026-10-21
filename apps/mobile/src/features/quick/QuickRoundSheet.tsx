import { useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Team } from '@buraco/shared'
import { StyleSheet, View } from 'react-native'
import { Button, NumberPad, Sheet } from '@/components/ui'
import { EntryPreviewCard } from '@/features/game/live/EntryPreviewCard'
import { ScoreField } from '@/features/game/live/ScoreField'
import { type EntryAction, type EntryState, entryReducer, initialEntry, previewEntry, validateEntry } from '@/features/game/live/scoreEntry'
import { formatNumber } from '@/lib/format'
import { space } from '@/theme/tokens'
import { QUICK_CUT_BONUS, type QuickGame, type QuickRound, quickConfig, quickTotals, roundPoints } from './model'

export interface QuickRoundSheetProps {
  game: QuickGame
  /** Index of the round being edited, or null for a new round. */
  editing: number | null
  onSave: (a: number, b: number, cut: Team | null) => void
  onClose: () => void
}

const fromRound = (r: QuickRound): EntryState => ({
  A: { digits: String(Math.abs(r.a)), negative: r.a < 0 },
  B: { digits: String(Math.abs(r.b)), negative: r.b < 0 },
  focus: 'A',
})

/** Dealt rounds only: +100 bonus entries from the score cards have no round number. */
const roundsBefore = (game: QuickGame, index: number): number => game.rounds.slice(0, index).filter((r) => !r.bonusOnly).length

/** Mounted only while open (keyed by the parent), so each opening starts from a fresh form. */
export function QuickRoundSheet({ game, editing, onSave, onClose }: QuickRoundSheetProps) {
  const { t } = useTranslation(['quick', 'common', 'game'])
  const editingRound = editing === null ? null : game.rounds[editing]
  const [state, dispatch] = useReducer(
    (s: EntryState, a: EntryAction) => entryReducer(s, a, true),
    editingRound ? fromRound(editingRound) : initialEntry,
  )
  const [attempted, setAttempted] = useState(false)
  // The cut is added with the +100 button on the score card; editing keeps a round's cut as is.
  const cut: Team | null = editingRound?.cut ?? null
  const config = quickConfig(game)
  const validation = validateEntry(state, config)
  // Editing previews the totals with this round replaced, not added on top.
  const totals = quickTotals(game)
  const base = editingRound ? { A: totals.A - roundPoints(editingRound, 'A'), B: totals.B - roundPoints(editingRound, 'B') } : totals
  const bonus = { A: cut === 'A' ? QUICK_CUT_BONUS : 0, B: cut === 'B' ? QUICK_CUT_BONUS : 0 }
  const preview = previewEntry(base, state, bonus, config)
  const n = roundsBefore(game, editing ?? game.rounds.length) + 1

  const save = (): void => {
    setAttempted(true)
    if (validation.values) onSave(validation.values.A, validation.values.B, cut)
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing === null ? t('roundTitle', { n: formatNumber(n) }) : t('editTitle', { n: formatNumber(n) })}
      subtitle={t('entryHint')}>
      <View style={styles.fields}>
        {(['A', 'B'] as const).map((team) => {
          const error = validation.errors[team]
          return (
            <ScoreField
              key={team}
              team={team}
              field={state[team]}
              focused={state.focus === team}
              allowNegative
              error={attempted || error !== 'missing' ? error : null}
              onFocus={() => dispatch({ type: 'focus', side: team })}
              onToggleSign={() => dispatch({ type: 'toggleSign', side: team })}
            />
          )
        })}
      </View>
      <EntryPreviewCard preview={preview} />
      <NumberPad
        onDigit={(digit) => dispatch({ type: 'digit', digit })}
        onDelete={() => dispatch({ type: 'delete' })}
        deleteLabel={t('common:pin.delete')}
        extraKey={{ label: '−/+', accessibilityLabel: t('game:enter.sign'), onPress: () => dispatch({ type: 'toggleSign' }) }}
      />
      <Button label={t('saveRound')} size="lg" block disabled={attempted && !validation.values} onPress={save} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: space.md },
})
