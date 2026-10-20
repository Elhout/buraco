import * as Haptics from 'expo-haptics'
import { useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, NumberPad, Sheet } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { space } from '@/theme/tokens'
import { submitRound } from '../actions'
import type { GameView } from '../model'
import { DealCuts } from './DealCuts'
import { EntryPreviewCard } from './EntryPreviewCard'
import { ScoreField } from './ScoreField'
import { bonusByTeam } from './roundRows'
import { type EntryAction, type EntryState, type FieldError, entryReducer, initialEntry, previewEntry, validateEntry } from './scoreEntry'

interface EnterRoundSheetProps {
  readonly visible: boolean
  readonly view: GameView
  readonly onClose: () => void
  readonly onSent: () => void
}

function useRoundEntry(view: GameView, visible: boolean, onSent: () => void) {
  const allowNegative = view.config.allowNegative
  const [state, dispatch] = useReducer((s: EntryState, a: EntryAction) => entryReducer(s, a, allowNegative), initialEntry)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Fresh form each time the sheet opens (state adjusted during render, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      dispatch({ type: 'reset' })
      setAttempted(false)
      setError(null)
    }
  }

  const dealLines = view.openRound?.lines ?? []
  const validation = validateEntry(state, view.config)
  const preview = previewEntry(view.totals, state, bonusByTeam(dealLines), view.config)
  const shownError = (e: FieldError | null): FieldError | null => (attempted || e !== 'missing' ? e : null)

  const send = async (): Promise<void> => {
    setAttempted(true)
    if (!validation.values) return
    setBusy(true)
    setError(null)
    try {
      // Saved to the outbox first: it shows as "Sending…" and posts when the signal returns.
      await submitRound(view.game.id, validation.values.A, validation.values.B)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSent()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const canSend = !attempted || validation.values !== null
  return { state, dispatch, dealLines, validation, preview, shownError, send, busy, error, canSend }
}

/** Two big fields on one number pad, a live preview, then "Send for confirmation". */
export function EnterRoundSheet({ visible, view, onClose, onSent }: EnterRoundSheetProps) {
  const { t } = useTranslation(['game', 'common'])
  const entry = useRoundEntry(view, visible, onSent)
  const { state, dispatch } = entry
  const allowNegative = view.config.allowNegative
  const roundNo = view.rounds.filter((r) => r.status === 'confirmed').length + 1
  return (
    <Sheet visible={visible} onClose={onClose} title={t('enter.title', { n: formatNumber(roundNo) })} locked={entry.busy}>
      <View style={styles.fields}>
        {(['A', 'B'] as const).map((team) => (
          <ScoreField
            key={team}
            team={team}
            field={state[team]}
            focused={state.focus === team}
            allowNegative={allowNegative}
            error={entry.shownError(entry.validation.errors[team])}
            onFocus={() => dispatch({ type: 'focus', side: team })}
            onToggleSign={() => dispatch({ type: 'toggleSign', side: team })}
          />
        ))}
      </View>
      <DealCuts lines={entry.dealLines} />
      <EntryPreviewCard preview={entry.preview} />
      <NumberPad
        onDigit={(digit) => dispatch({ type: 'digit', digit })}
        onDelete={() => dispatch({ type: 'delete' })}
        deleteLabel={t('common:pin.delete')}
        extraKey={
          allowNegative ? { label: '−/+', accessibilityLabel: t('enter.sign'), onPress: () => dispatch({ type: 'toggleSign' }) } : undefined
        }
      />
      <ErrorText error={entry.error} />
      <Button
        label={view.isGhost ? t('enter.sendGhost') : t('enter.send')}
        size="lg"
        block
        loading={entry.busy}
        disabled={!entry.canSend}
        onPress={() => void entry.send()}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: space.md },
})
