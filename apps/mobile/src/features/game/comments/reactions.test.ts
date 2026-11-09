import { describe, expect, it } from 'vitest'
import { countReactions } from './reactions'

const r = (comment: string, user: string, emoji: string) => ({ comment_id: comment, user_id: user, emoji })

describe('countReactions', () => {
  it("counts one comment's reactions in the fixed order and marks mine", () => {
    const rows = [r('c1', 'me', '😂'), r('c1', 'sara', '❤️'), r('c1', 'me', '❤️'), r('c2', 'sara', '👍'), r('c1', 'omar', '😂')]
    expect(countReactions(rows, 'c1', 'me')).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '😂', count: 2, mine: true },
    ])
    expect(countReactions(rows, 'c2', 'me')).toEqual([{ emoji: '👍', count: 1, mine: false }])
  })

  it('nothing for a comment without reactions', () => {
    expect(countReactions([], 'c1', 'me')).toEqual([])
  })
})
