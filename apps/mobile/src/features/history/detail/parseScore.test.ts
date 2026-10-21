import { describe, expect, it } from 'vitest'
import { parseScore } from './parseScore'

describe('parseScore', () => {
  it.each([
    ['120', 120],
    ['-35', -35],
    ['−35', -35],
    ['١٢٠', 120],
    [' 1,200 ', 1200],
    ['0', 0],
  ])('%j → %d', (input, n) => {
    expect(parseScore(input)).toBe(n)
  })

  it.each(['', '-', '12a', '1.5', '123456'])('rejects %j', (input) => {
    expect(parseScore(input)).toBeNull()
  })
})
