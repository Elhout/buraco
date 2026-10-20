import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PinDraft, addDigit, confirmedPin, createPinDraft, removeDigit } from '../pinEntry'

export interface PinChooser {
  draft: PinDraft
  prompt: string
  hint: string | null
  /** Feed a digit; resolves the confirmed PIN once it was typed twice the same. */
  onDigit: (digit: string) => string | null
  onDelete: () => void
  reset: (withCurrent?: boolean) => void
}

/** Shared "choose → repeat" state with prompts and mismatch feedback. */
export function usePinChooser(withCurrent = false): PinChooser {
  const { t } = useTranslation('auth')
  const [draft, setDraft] = useState<PinDraft>(() => createPinDraft(withCurrent))

  const prompt = t(`pinSetup.prompt_${draft.step}`)
  const hint = draft.mismatch ? t('pinSetup.mismatch') : null

  return {
    draft,
    prompt,
    hint,
    onDigit: (digit) => {
      const next = addDigit(draft, digit)
      setDraft(next)
      if (next.mismatch && !draft.mismatch) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return confirmedPin(next)
    },
    onDelete: () => setDraft(removeDigit(draft)),
    reset: (current = withCurrent) => setDraft(createPinDraft(current)),
  }
}
