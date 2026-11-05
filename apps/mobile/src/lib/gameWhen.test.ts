import { describe, expect, it } from 'vitest'
import { gameDateTime, gameSpan } from './gameWhen'

const TZ = 'Asia/Kuwait' // UTC+3, no daylight saving

describe('gameDateTime', () => {
  it('shows the weekday, date and time', () => {
    expect(gameDateTime('2026-11-05T20:18:00Z', 'en-GB', TZ)).toBe('Thu, 5 Nov 2026 · 23:18')
    expect(gameDateTime('2026-11-05T20:18:00Z', 'en-US', TZ)).toBe('Thu, Nov 5, 2026 · 11:18 PM')
  })
})

describe('gameSpan', () => {
  it('start and end time on one day', () => {
    expect(gameSpan('2026-11-05T19:35:00Z', '2026-11-05T20:18:00Z', 'en-US', TZ)).toBe('Thu, Nov 5, 2026 · 10:35 PM – 11:18 PM')
  })

  it('a game past midnight names both days', () => {
    expect(gameSpan('2026-11-05T20:30:00Z', '2026-11-05T21:40:00Z', 'en-US', TZ)).toBe(
      'Thu, Nov 5, 2026 · 11:30 PM – Fri, Nov 6, 2026 · 12:40 AM',
    )
  })

  it('only the start while the game is still going, nothing without dates', () => {
    expect(gameSpan('2026-11-05T19:35:00Z', null, 'en-US', TZ)).toBe('Thu, Nov 5, 2026 · 10:35 PM')
    expect(gameSpan(null, null, 'en-US', TZ)).toBe('')
  })
})
