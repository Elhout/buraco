import { describe, expect, it } from 'vitest'
import { isDeleteConfirmed } from './deleteConfirm'

describe('isDeleteConfirmed', () => {
  it('accepts DELETE in any case, trimmed', () => {
    expect(isDeleteConfirmed('DELETE')).toBe(true)
    expect(isDeleteConfirmed(' delete ')).toBe(true)
  })

  it('accepts the Arabic word, with or without diacritics', () => {
    expect(isDeleteConfirmed('حذف')).toBe(true)
    expect(isDeleteConfirmed('حَذْف')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isDeleteConfirmed('')).toBe(false)
    expect(isDeleteConfirmed('DELET')).toBe(false)
    expect(isDeleteConfirmed('delete account')).toBe(false)
  })
})
