import { useTranslation } from 'react-i18next'
import { type PinFailure, minutesLeft } from '@/lib/pin'

/** Same wording as the shared PIN sheet for a rejected PIN. */
export function usePinFailureText(): (failure: PinFailure) => string {
  const { t } = useTranslation()
  return (failure) => {
    if (failure.error === 'wrong_pin') return t('pin.wrong', { count: failure.attempts_left ?? 0 })
    if (failure.error === 'locked') return t('pin.locked', { count: minutesLeft(failure.locked_until) })
    return t('pin.noPin')
  }
}
