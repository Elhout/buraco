import { useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, NumberPad, Sheet } from '@/components/ui'
import { EntryPreviewCard } from '@/features/game/live/EntryPreviewCard'
import { ScoreField } from '@/features/game/live/ScoreField'
import { type EntryAction, type EntryState, entryReducer, initialEntry, previewEntry, validateEntry } from '@/features/game/live/scoreEntry'
import { formatNumber } from '@/lib/format'
import { space } from '@/theme/tokens'
import { type QuickGame, type QuickRound, quickConfig, quickTotals } from './model'

export interface QuickRoundSheetProps {
  game: QuickGame
  /** Index of the round being edited, or null for a new round. */
  editing: number | null
  onSave: (a: number, b: number) => void
  onClose: () => void
}

const fromRound = (r: QuickRound): EntryState => ({
  A: { digits: String(Math.abs(r.a)), negative: r.a < 0 },
  B: { digits: String(Math.abs(r.b)), negative: r.b < 0 },
  focus: 'A',
})

/** Mounted only while open (keyed by the parent), so each opening starts from a fresh form. */
export function QuickRoundSheet({ game, editing, onSave, onClose }: QuickRoundSheetProps) {
  const { t } = useTranslation(['quick', 'common', 'game'])
  const editingRound = editing === null ? null : game.rounds[editing]
  const [state, dispatch] = useReducer(
    (s: EntryState, a: EntryAction) => entryReducer(s, a, true),
    editingRound ? fromRound(editingRound) : initialEntry,
  )
  const [attempted, setAttempted] = useState(false)
  const config = quickConfig(game)
  const validation = validateEntry(state, config)
  // Editing previews the totals with this round replaced, not added on top.
  const base = editingRound ? { A: quickTotals(game).A - editingRound.a, B: quickTotals(game).B - editingRound.b } : quickTotals(game)
  const preview = previewEntry(base, state, { A: 0, B: 0 }, config)
  const n = editing === null ? game.rounds.length + 1 : editing + 1

  const save = (): void => {
    setAttempted(true)
    if (validation.values) onSave(validation.values.A, validation.values.B)
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
