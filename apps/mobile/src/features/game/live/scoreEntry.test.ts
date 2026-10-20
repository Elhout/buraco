import { DEFAULT_CONFIG } from '@buraco/shared'
import { describe, expect, it } from 'vitest'
import { type EntryAction, type EntryState, entryReducer, fieldValue, initialEntry, previewEntry, validateEntry } from './scoreEntry'

const run = (actions: readonly EntryAction[], allowNegative = true, start: EntryState = initialEntry): EntryState =>
  actions.reduce((s, a) => entryReducer(s, a, allowNegative), start)

const digits = (text: string): EntryAction[] => [...text].map((digit) => ({ type: 'digit', digit }))

describe('entryReducer', () => {
  it('types into the focused field and switches field on focus', () => {
    const s = run([...digits('350'), { type: 'focus', side: 'B' }, ...digits('120')])
    expect(fieldValue(s.A)).toBe(350)
    expect(fieldValue(s.B)).toBe(120)
    expect(s.focus).toBe('B')
  })

  it('replaces a lone leading zero and caps the length at 5 digits', () => {
    expect(run(digits('05')).A.digits).toBe('5')
    expect(run(digits('1234567')).A.digits).toBe('12345')
  })

  it('ignores anything that is not a single digit', () => {
    expect(
      run([
        { type: 'digit', digit: 'x' },
        { type: 'digit', digit: '12' },
      ]).A.digits,
    ).toBe('')
  })

  it('deletes the last digit of the focused field only', () => {
    const s = run([...digits('45'), { type: 'focus', side: 'B' }, ...digits('9'), { type: 'focus', side: 'A' }, { type: 'delete' }])
    expect(s.A.digits).toBe('4')
    expect(s.B.digits).toBe('9')
  })

  it('toggles the sign of the focused or the named field when negatives are allowed', () => {
    const s = run([...digits('50'), { type: 'toggleSign' }, { type: 'toggleSign', side: 'B' }])
    expect(fieldValue(s.A)).toBe(-50)
    expect(s.B.negative).toBe(true)
    expect(run([...digits('50'), { type: 'toggleSign' }, { type: 'toggleSign' }]).A.negative).toBe(false)
  })

  it('never flips the sign when the club forbids negative rounds', () => {
    expect(run([...digits('50'), { type: 'toggleSign' }], false).A.negative).toBe(false)
  })

  it('resets to empty fields focused on A', () => {
    expect(run([...digits('9'), { type: 'focus', side: 'B' }, { type: 'reset' }])).toEqual(initialEntry)
  })
})

describe('fieldValue', () => {
  it('is null while empty and treats −0 as 0', () => {
    expect(fieldValue({ digits: '', negative: true })).toBeNull()
    expect(fieldValue({ digits: '0', negative: true })).toBe(0)
  })
})

describe('validateEntry', () => {
  it('requires both scores', () => {
    const v = validateEntry(run(digits('300')), DEFAULT_CONFIG)
    expect(v.errors).toEqual({ A: null, B: 'missing' })
    expect(v.values).toBeNull()
  })

  it('returns both values when valid', () => {
    const v = validateEntry(run([...digits('300'), { type: 'focus', side: 'B' }, ...digits('0')]), DEFAULT_CONFIG)
    expect(v.values).toEqual({ A: 300, B: 0 })
  })

  it('rejects negative scores when the config forbids them', () => {
    const state: EntryState = { A: { digits: '50', negative: true }, B: { digits: '10', negative: false }, focus: 'A' }
    const v = validateEntry(state, { ...DEFAULT_CONFIG, allowNegative: false })
    expect(v.errors.A).toBe('negative_not_allowed')
    expect(v.values).toBeNull()
  })
})

describe('previewEntry', () => {
  const state = run([...digits('400'), { type: 'focus', side: 'B' }, ...digits('200'), { type: 'toggleSign' }])

  it('adds typed scores and the bonuses tapped this deal to the current totals', () => {
    const p = previewEntry({ A: 1000, B: 900 }, state, { A: 100, B: 0 }, DEFAULT_CONFIG)
    expect(p.totals).toEqual({ A: 1500, B: 700 })
    expect(p.toGo).toEqual({ A: 500, B: 1300 })
    expect(p.outcome.kind).toBe('in_progress')
  })

  it('shows the would-be winner and clamps points to go at zero', () => {
    const p = previewEntry({ A: 1700, B: 900 }, state, { A: 0, B: 0 }, DEFAULT_CONFIG)
    expect(p.toGo.A).toBe(0)
    expect(p.outcome).toEqual({ kind: 'won', winner: 'A' })
  })

  it('counts empty fields as zero and reports a tie at the target', () => {
    const p = previewEntry({ A: 2000, B: 2000 }, initialEntry, { A: 0, B: 0 }, DEFAULT_CONFIG)
    expect(p.outcome.kind).toBe('tie_at_target')
  })
})
