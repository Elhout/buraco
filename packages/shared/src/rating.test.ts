import { describe, expect, it } from 'vitest'
import { RATING_PRIOR_GAMES, adjustedWinRate } from './rating'

describe('adjustedWinRate', () => {
  it('counts every player as if they also had 5 wins and 5 losses', () => {
    expect(RATING_PRIOR_GAMES).toBe(10)
    expect(adjustedWinRate(3, 3)).toBeCloseTo(8 / 13)
    expect(adjustedWinRate(7, 10)).toBeCloseTo(12 / 20)
    expect(adjustedWinRate(65, 100)).toBeCloseTo(70 / 110)
  })

  it('starts at 50% and a long record outweighs a short lucky streak', () => {
    expect(adjustedWinRate(0, 0)).toBe(0.5)
    expect(adjustedWinRate(65, 100)).toBeGreaterThan(adjustedWinRate(3, 3))
    expect(adjustedWinRate(3, 3)).toBeGreaterThan(adjustedWinRate(7, 10))
  })

  it('counts a draw as half a win', () => {
    expect(adjustedWinRate(4, 10, 2)).toBeCloseTo(10 / 20)
  })
})
