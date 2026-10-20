import { PIN_LENGTH } from '../../lib/pin'

/**
 * Keypad state for choosing a PIN: (optionally the current PIN →) new PIN → repeat it.
 * A mismatch on repeat starts the new PIN over. Pure; tested in pinEntry.test.ts.
 */
export type PinStep = 'current' | 'choose' | 'repeat'

export interface PinDraft {
  readonly step: PinStep
  readonly current: string
  readonly first: string
  readonly entry: string
  readonly mismatch: boolean
}

export const createPinDraft = (withCurrent = false): PinDraft => ({
  step: withCurrent ? 'current' : 'choose',
  current: '',
  first: '',
  entry: '',
  mismatch: false,
})

const advance = (d: PinDraft, entry: string): PinDraft => {
  if (d.step === 'current') return { ...d, step: 'choose', current: entry, entry: '', mismatch: false }
  if (d.step === 'choose') return { ...d, step: 'repeat', first: entry, entry: '', mismatch: false }
  if (entry === d.first) return { ...d, entry }
  return { ...d, step: 'choose', first: '', entry: '', mismatch: true }
}

export function addDigit(d: PinDraft, digit: string): PinDraft {
  if (!/^[0-9]$/.test(digit) || d.entry.length >= PIN_LENGTH) return d
  const entry = d.entry + digit
  return entry.length === PIN_LENGTH ? advance(d, entry) : { ...d, entry, mismatch: false }
}

export const removeDigit = (d: PinDraft): PinDraft => ({ ...d, entry: d.entry.slice(0, -1) })

/** The confirmed new PIN once it was typed twice the same, else null. */
export const confirmedPin = (d: PinDraft): string | null =>
  d.step === 'repeat' && d.entry.length === PIN_LENGTH && d.entry === d.first ? d.entry : null

/** After the server rejected the current PIN: ask for it again, keep nothing else. */
export const restartAtCurrent = (): PinDraft => createPinDraft(true)
