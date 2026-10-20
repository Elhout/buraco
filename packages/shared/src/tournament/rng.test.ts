import { describe, expect, it } from 'vitest'
import { createRng, shuffle } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a(), a(), a(), a()]).toEqual([b(), b(), b(), b()])
  })

  it('produces different sequences for different seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })

  it('returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('returns a new array containing the same items without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const copy = [...input]
    const out = shuffle(input, createRng(3))
    expect(out).not.toBe(input)
    expect(input).toEqual(copy)
    expect([...out].sort((x, y) => x - y)).toEqual(copy)
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    const input = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffle(input, createRng(5))).toEqual(shuffle(input, createRng(5)))
    expect(shuffle(input, createRng(5))).not.toEqual(shuffle(input, createRng(6)))
  })

  it('handles empty and single-item arrays', () => {
    expect(shuffle([], createRng(1))).toEqual([])
    expect(shuffle(['x'], createRng(1))).toEqual(['x'])
  })
})
