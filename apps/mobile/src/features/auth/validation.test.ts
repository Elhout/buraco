import { describe, expect, it } from 'vitest'
import { prefillName, validateDisplayName } from './validation'

describe('validateDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(validateDisplayName('  Omar   Khalid ')).toEqual({ ok: true, name: 'Omar Khalid' })
  })

  it('rejects empty and over-long names', () => {
    expect(validateDisplayName('   ')).toEqual({ ok: false, problem: 'empty' })
    expect(validateDisplayName('x'.repeat(41))).toEqual({ ok: false, problem: 'tooLong' })
    expect(validateDisplayName('x'.repeat(40))).toEqual({ ok: true, name: 'x'.repeat(40) })
  })

  it('accepts Arabic names', () => {
    expect(validateDisplayName('سارة')).toEqual({ ok: true, name: 'سارة' })
  })
})

describe('prefillName', () => {
  it('uses the name the admin gave the account', () => {
    expect(prefillName({ display_name: 'Sara' }, 'Player')).toBe('Sara')
  })

  it('falls back to the profile name but never the placeholder', () => {
    expect(prefillName({}, 'Ahmed')).toBe('Ahmed')
    expect(prefillName(undefined, 'Player')).toBe('')
    expect(prefillName({ display_name: '  ' }, null)).toBe('')
  })
})
