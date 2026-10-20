import { describe, expect, it } from 'vitest'
import { configFromSnapshot } from './config'
import { DEFAULT_CONFIG } from './scoring'

describe('configFromSnapshot', () => {
  it('maps the snake_case snapshot stored on games', () => {
    expect(configFromSnapshot({ target_score: 1500, cut_bonus: 50, allow_negative: false })).toEqual({
      targetScore: 1500,
      cutBonus: 50,
      allowNegative: false,
    })
  })

  it('falls back to defaults for missing or malformed fields', () => {
    expect(configFromSnapshot({ target_score: 'x', cut_bonus: null })).toEqual(DEFAULT_CONFIG)
    expect(configFromSnapshot(null)).toEqual(DEFAULT_CONFIG)
    expect(configFromSnapshot([1, 2])).toEqual(DEFAULT_CONFIG)
  })

  it('rejects a non-positive target', () => {
    expect(configFromSnapshot({ target_score: 0 }).targetScore).toBe(DEFAULT_CONFIG.targetScore)
  })
})
