import { describe, expect, it } from 'vitest'
import { parsePreference, resolveScheme } from './schemeRules'

describe('theme preference', () => {
  it('parses stored values, defaulting to system', () => {
    expect(parsePreference('dark')).toBe('dark')
    expect(parsePreference('light')).toBe('light')
    expect(parsePreference(null)).toBe('system')
    expect(parsePreference('purple')).toBe('system')
  })

  it('follows the phone only in system mode', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark')
    expect(resolveScheme('system', 'light')).toBe('light')
    expect(resolveScheme('system', null)).toBe('light')
    expect(resolveScheme('dark', 'light')).toBe('dark')
    expect(resolveScheme('light', 'dark')).toBe('light')
  })
})
