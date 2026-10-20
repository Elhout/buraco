import { describe, expect, it } from 'vitest'
import { isValidPin, minutesLeft, parsePinResult } from './pin'

describe('parsePinResult', () => {
  it('reads success with the updated game', () => {
    expect(parsePinResult({ ok: true, game: { id: 'g' } })).toEqual({ ok: true, game: { id: 'g' } })
  })

  it('reads a wrong PIN with attempts left', () => {
    expect(parsePinResult({ ok: false, error: 'wrong_pin', attempts_left: 3 })).toEqual({ ok: false, error: 'wrong_pin', attempts_left: 3 })
  })

  it('reads a lockout', () => {
    const r = parsePinResult({ ok: false, error: 'locked', locked_until: '2026-10-19T20:00:00Z' })
    expect(r).toMatchObject({ ok: false, error: 'locked' })
  })

  it('rejects anything else', () => {
    expect(() => parsePinResult({ ok: false, error: 'hacked' })).toThrow()
    expect(() => parsePinResult(null)).toThrow()
  })
})

describe('isValidPin', () => {
  it.each([
    ['1234', true],
    ['0000', true],
    ['123', false],
    ['12345', false],
    ['12a4', false],
    ['١٢٣٤', false],
  ])('%j → %s', (pin, ok) => {
    expect(isValidPin(pin)).toBe(ok)
  })
})

describe('minutesLeft', () => {
  const now = Date.parse('2026-10-19T20:00:00Z')
  it('rounds up to whole minutes', () => {
    expect(minutesLeft('2026-10-19T20:14:01Z', now)).toBe(15)
    expect(minutesLeft('2026-10-19T20:00:10Z', now)).toBe(1)
  })
  it('is zero once the lock has passed or when absent', () => {
    expect(minutesLeft('2026-10-19T19:59:00Z', now)).toBe(0)
    expect(minutesLeft(undefined, now)).toBe(0)
  })
})
