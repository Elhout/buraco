import { describe, expect, it } from 'vitest'
import { type EventContext, type EventRow, actorName, describeEvent } from './events'

const ctx: EventContext = {
  seatName: (seat) => ({ 1: 'Amal', 2: 'Badr', 3: 'Chadi', 4: 'Dana' })[seat] ?? null,
  userName: (id) => ({ u1: 'Amal', u5: 'Eman', host: 'Hadi' })[id] ?? null,
  roundNo: (id) => (id === 'r3' ? 3 : null),
  formatNumber: (n) => String(n),
  teamLabel: (team) => `Team ${team}`,
  someone: 'Someone',
}

const ev = (type: string, over: Partial<EventRow> = {}): EventRow => ({
  id: 'e1',
  type,
  actor_seat: null,
  actor_id: null,
  payload: {},
  created_at: '2026-10-19T20:00:00Z',
  ...over,
})

describe('actorName', () => {
  it('prefers the seat, then the user, then the fallback', () => {
    expect(actorName(ev('x', { actor_seat: 2, actor_id: 'u1' }), ctx)).toBe('Badr')
    expect(actorName(ev('x', { actor_id: 'host' }), ctx)).toBe('Hadi')
    expect(actorName(ev('x', { actor_id: 'gone' }), ctx)).toBe('Someone')
    expect(actorName(ev('x'), ctx)).toBe('Someone')
  })
})

describe('describeEvent', () => {
  it('maps simple events with their actor', () => {
    expect(describeEvent(ev('invite_accepted', { actor_seat: 3 }), ctx)).toEqual({
      key: 'inviteAccepted',
      values: { actor: 'Chadi' },
      tone: 'success',
    })
    expect(describeEvent(ev('seat_verified', { actor_seat: 4 }), ctx)).toMatchObject({ key: 'seatVerified', tone: 'ghost' })
    expect(describeEvent(ev('expired'), ctx).key).toBe('expired')
    expect(describeEvent(ev('abandoned', { actor_seat: 1 }), ctx)).toMatchObject({ key: 'abandoned', tone: 'danger' })
  })

  it('distinguishes how the game was created', () => {
    expect(describeEvent(ev('created', { actor_seat: 1, payload: { mode: 'normal' } }), ctx)).toMatchObject({
      key: 'created',
      values: { actor: 'Amal' },
    })
    expect(describeEvent(ev('created', { actor_id: 'host', payload: { mode: 'ghost' } }), ctx)).toMatchObject({
      key: 'createdGhost',
      values: { actor: 'Hadi' },
    })
    expect(describeEvent(ev('created', { payload: { mode: 'tournament', match_id: 'm' } }), ctx).key).toBe('createdTournament')
  })

  it('names both players of a seat swap', () => {
    expect(describeEvent(ev('seat_swapped', { payload: { seat: 2, from: 'u1', to: 'u5' } }), ctx)).toEqual({
      key: 'seatSwapped',
      values: { from: 'Amal', to: 'Eman' },
      tone: 'neutral',
    })
    expect(describeEvent(ev('seat_swapped', { payload: { seat: 2 } }), ctx).values).toEqual({ from: 'Someone', to: 'Someone' })
  })

  it('shows the disputed round and scores', () => {
    const d = describeEvent(ev('round_disputed', { actor_seat: 2, payload: { round_id: 'r3', a: 120, b: '-35' } }), ctx)
    expect(d).toEqual({ key: 'roundDisputed', values: { actor: 'Badr', round: '3', a: '120', b: '-35' }, tone: 'danger' })
  })

  it('shows the undone round, falling back to round_no from the payload', () => {
    expect(describeEvent(ev('undo', { actor_seat: 1, payload: { round_id: 'r9', round_no: 5, a: 10, b: 20 } }), ctx).values).toEqual({
      actor: 'Amal',
      round: '5',
      a: '10',
      b: '20',
    })
    expect(describeEvent(ev('undo', { payload: {} }), ctx).values).toMatchObject({ round: '—', a: '0', b: '0' })
  })

  it('describes the proposed and final result', () => {
    expect(describeEvent(ev('result_proposed', { payload: { winner: 'B', a: 1800, b: 2050 } }), ctx).values).toEqual({
      team: 'Team B',
      a: '1800',
      b: '2050',
    })
    expect(describeEvent(ev('finished', { payload: { winner: 'A' } }), ctx)).toEqual({
      key: 'finished',
      values: { team: 'Team A' },
      tone: 'success',
    })
    expect(describeEvent(ev('finished', { payload: { winner: 'X' } }), ctx).values).toEqual({ team: '—' })
  })

  it('names the new scorekeeper from the payload seat', () => {
    expect(describeEvent(ev('scorekeeper_reassigned', { payload: { seat: 4 } }), ctx).values).toEqual({ name: 'Dana' })
    expect(describeEvent(ev('scorekeeper_reassigned', { payload: null }), ctx).values).toEqual({ name: 'Someone' })
  })

  it('falls back for unknown event types', () => {
    expect(describeEvent(ev('teleported'), ctx)).toEqual({ key: 'unknown', values: { type: 'teleported' }, tone: 'neutral' })
  })
})
