import { describe, expect, it } from 'vitest'
import type { SeatView } from './model'
import { rematchSeats } from './rematch'

const seat = (n: number, team: 'A' | 'B', userId: string | null, name: string): SeatView => ({
  seat: n,
  team,
  userId,
  name,
  avatarUrl: null,
  isGuest: userId === null,
  inviteStatus: 'confirmed',
  isScorekeeper: false,
  verified: false,
  isMe: false,
})

describe('rematchSeats', () => {
  it('keeps every seat and team, members by id and guests by name', () => {
    expect(
      rematchSeats([seat(3, 'A', 'u3', 'Sara'), seat(1, 'A', 'u1', 'Omar'), seat(4, 'B', null, 'Uncle'), seat(2, 'B', 'u2', 'Nour')]),
    ).toEqual([
      { seat: 1, team: 'A', userId: 'u1' },
      { seat: 2, team: 'B', userId: 'u2' },
      { seat: 3, team: 'A', userId: 'u3' },
      { seat: 4, team: 'B', guestName: 'Uncle' },
    ])
  })
})
