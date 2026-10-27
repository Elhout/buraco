import { describe, expect, it } from 'vitest'
import { type ChatRow, toBubbles } from './model'

const row = (id: string, user: string, at: string): ChatRow => ({ id, club_id: 'c', user_id: user, body: id, created_at: at })

describe('toBubbles', () => {
  it('starts a run where the sender changes or after a 5 minute pause, newest first', () => {
    const rows = [
      row('m4', 'me', '2026-10-27T20:20:00Z'),
      row('m3', 'sara', '2026-10-27T20:10:00Z'),
      row('m2', 'sara', '2026-10-27T20:01:00Z'),
      row('m1', 'sara', '2026-10-27T20:00:00Z'),
    ]
    expect(toBubbles(rows, 'me').map((b) => [b.id, b.mine, b.startsRun])).toEqual([
      ['m4', true, true],
      ['m3', false, true],
      ['m2', false, false],
      ['m1', false, true],
    ])
  })

  it('handles an empty chat', () => {
    expect(toBubbles([], 'me')).toEqual([])
  })
})
