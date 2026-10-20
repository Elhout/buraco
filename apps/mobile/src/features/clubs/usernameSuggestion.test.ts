import { describe, expect, it } from 'vitest'
import { suggestUsername } from './usernameSuggestion'

describe('suggestUsername', () => {
  it.each([
    ['Samy', 'samy'],
    ['Abu Ali', 'abuali'],
    ['Fasial 2', 'fasial2'],
    ['Zoë', 'zoe'],
    ['Hadida!', 'hadida'],
  ])('%j → %j', (name, username) => {
    expect(suggestUsername(name)).toBe(username)
  })

  it('gives up when the name has too few Latin characters', () => {
    expect(suggestUsername('AK')).toBe('')
    expect(suggestUsername('سامي')).toBe('')
    expect(suggestUsername('')).toBe('')
  })
})
