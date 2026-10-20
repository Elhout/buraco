import { describe, expect, it } from 'vitest'
import { type PinDraft, addDigit, confirmedPin, createPinDraft, removeDigit, restartAtCurrent } from './pinEntry'

const type = (d: PinDraft, digits: string): PinDraft => [...digits].reduce(addDigit, d)

describe('pinEntry', () => {
  it('moves from choose to repeat after 4 digits', () => {
    const d = type(createPinDraft(), '1234')
    expect(d.step).toBe('repeat')
    expect(d.first).toBe('1234')
    expect(d.entry).toBe('')
  })

  it('confirms when the repeat matches', () => {
    const d = type(createPinDraft(), '12341234')
    expect(confirmedPin(d)).toBe('1234')
  })

  it('starts over with a mismatch flag when the repeat differs', () => {
    const d = type(createPinDraft(), '12344321')
    expect(d).toEqual({ step: 'choose', current: '', first: '', entry: '', mismatch: true })
    expect(confirmedPin(d)).toBeNull()
  })

  it('clears the mismatch flag on the next digit', () => {
    const d = type(createPinDraft(), '123443215')
    expect(d.mismatch).toBe(false)
    expect(d.entry).toBe('5')
  })

  it('asks for the current PIN first when changing it', () => {
    const d = type(createPinDraft(true), '0000')
    expect(d.step).toBe('choose')
    expect(d.current).toBe('0000')
    const done = type(d, '11111111')
    expect(confirmedPin(done)).toBe('1111')
    expect(done.current).toBe('0000')
  })

  it('ignores non-digits and extra digits', () => {
    const d = type(createPinDraft(), '12a')
    expect(d.entry).toBe('12')
    const full = type(createPinDraft(), '12341234')
    expect(addDigit(full, '5')).toBe(full)
  })

  it('deletes the last digit', () => {
    expect(removeDigit(type(createPinDraft(), '12')).entry).toBe('1')
    expect(removeDigit(createPinDraft()).entry).toBe('')
  })

  it('restarts at the current-PIN step', () => {
    expect(restartAtCurrent()).toEqual(createPinDraft(true))
  })
})
