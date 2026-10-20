import { describe, expect, it } from 'vitest'
import { type InviteSeat, canRespond, canSwap, confirmedCount, hostCanAct, invitePhase, msLeft, swapCandidates } from './model'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const inMs = (ms: number): string => new Date(NOW + ms).toISOString()
const seat = (n: number, userId: string | null, inviteStatus: InviteSeat['inviteStatus'], isMe = false): InviteSeat => ({
  seat: n,
  userId,
  inviteStatus,
  isMe,
})

describe('msLeft', () => {
  it('counts down and never goes negative', () => {
    expect(msLeft(inMs(90_000), NOW)).toBe(90_000)
    expect(msLeft(inMs(-5_000), NOW)).toBe(0)
    expect(msLeft(null, NOW)).toBe(0)
  })
})

describe('invitePhase', () => {
  it('waits while the clock runs', () => {
    expect(invitePhase({ status: 'inviting', inviteExpiresAt: inMs(1_000) }, NOW)).toBe('waiting')
    expect(invitePhase({ status: 'inviting', inviteExpiresAt: null }, NOW)).toBe('waiting')
  })

  it('reports time up before the server expires the game', () => {
    expect(invitePhase({ status: 'inviting', inviteExpiresAt: inMs(0) }, NOW)).toBe('timeUp')
  })

  it('maps terminal statuses', () => {
    expect(invitePhase({ status: 'live', inviteExpiresAt: null }, NOW)).toBe('live')
    expect(invitePhase({ status: 'expired', inviteExpiresAt: null }, NOW)).toBe('expired')
    expect(invitePhase({ status: 'abandoned', inviteExpiresAt: null }, NOW)).toBe('cancelled')
    expect(invitePhase({ status: 'finished', inviteExpiresAt: null }, NOW)).toBe('over')
  })
})

describe('permissions', () => {
  it('lets an invited player respond only while waiting', () => {
    expect(canRespond('waiting', seat(2, 'me', 'invited', true))).toBe(true)
    expect(canRespond('timeUp', seat(2, 'me', 'invited', true))).toBe(false)
    expect(canRespond('waiting', seat(2, 'me', 'confirmed', true))).toBe(false)
    expect(canRespond('waiting', null)).toBe(false)
  })

  it('lets the host swap unconfirmed seats except their own', () => {
    expect(canSwap('waiting', true, seat(2, 'x', 'invited'), 'h')).toBe(true)
    expect(canSwap('timeUp', true, seat(2, 'x', 'declined'), 'h')).toBe(true)
    expect(canSwap('waiting', true, seat(2, 'x', 'confirmed'), 'h')).toBe(false)
    expect(canSwap('waiting', true, seat(1, 'h', 'invited'), 'h')).toBe(false)
    expect(canSwap('waiting', false, seat(2, 'x', 'invited'), 'h')).toBe(false)
    expect(canSwap('expired', true, seat(2, 'x', 'invited'), 'h')).toBe(false)
    expect(canSwap('waiting', true, seat(2, null, 'invited'), null)).toBe(false)
  })

  it('offers host actions until the game leaves inviting', () => {
    expect(hostCanAct('waiting', true)).toBe(true)
    expect(hostCanAct('timeUp', true)).toBe(true)
    expect(hostCanAct('cancelled', true)).toBe(false)
    expect(hostCanAct('waiting', false)).toBe(false)
  })
})

describe('swapCandidates', () => {
  it('excludes seated players and sorts by name', () => {
    const members = [
      { userId: 'h', name: 'Host' },
      { userId: 'z', name: 'Zain' },
      { userId: 'a', name: 'Amal' },
      { userId: 'x', name: 'Seated' },
    ]
    const seats = [seat(1, 'h', 'confirmed'), seat(2, 'x', 'declined'), seat(3, null, 'invited')]
    expect(swapCandidates(members, seats).map((m) => m.userId)).toEqual(['a', 'z'])
  })

  it('counts confirmed seats', () => {
    expect(confirmedCount([seat(1, 'h', 'confirmed'), seat(2, 'x', 'invited'), seat(3, 'y', 'confirmed')])).toBe(2)
  })
})
