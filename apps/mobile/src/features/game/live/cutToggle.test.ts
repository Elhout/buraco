import { describe, expect, it } from 'vitest'
import { planCutToggle } from './cutToggle'

const seats = [
  { seat: 1, team: 'A' as const, isMe: false },
  { seat: 2, team: 'B' as const, isMe: false },
  { seat: 3, team: 'A' as const, isMe: true },
  { seat: 4, team: 'B' as const, isMe: false },
]

describe('planCutToggle', () => {
  it('adds a cut for the team, credited to me when I am on it', () => {
    expect(planCutToggle('A', [], seats)).toEqual({ remove: [], add: 3 })
  })

  it("credits the team's first seat when I am not on it", () => {
    expect(planCutToggle('B', [], seats)).toEqual({ remove: [], add: 2 })
  })

  it('removes the cut on a second tap', () => {
    expect(planCutToggle('A', [{ id: 'l1', seat: 3, team: 'A' }], seats)).toEqual({ remove: ['l1'], add: null })
  })

  it('moves the cut from the other team (only one team cuts a deal)', () => {
    expect(planCutToggle('B', [{ id: 'l1', seat: 3, team: 'A' }], seats)).toEqual({ remove: ['l1'], add: 2 })
  })
})
