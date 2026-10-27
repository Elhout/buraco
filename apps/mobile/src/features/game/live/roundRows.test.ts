import { describe, expect, it } from 'vitest'
import { actionBlock, opponentOf } from './actionState'
import { bonusByTeam, buildRoundRows } from './roundRows'
import { outboxItem, roundRow, view } from './testFixtures'

const rowsOf = (v: ReturnType<typeof view>, outbox: Parameters<typeof buildRoundRows>[0]['outbox'] = []) =>
  buildRoundRows({ rounds: v.rounds, seats: v.seats, outbox, cutBonus: 100 })

describe('buildRoundRows', () => {
  it('lists rounds newest first with who entered and who confirmed', () => {
    const rows = rowsOf(view([roundRow(1, 'confirmed', 300, 200, 1), roundRow(2, 'confirmed', 50, 400, 1)]))
    expect(rows.map((r) => r.no)).toEqual([2, 1])
    expect(rows[1]).toMatchObject({ status: 'confirmed', a: 300, b: 200, enteredBy: 'U1', confirmedBy: 'U2', waitingFor: null })
  })

  it("marks rounds the game's creator edited and keeps the saved round for editing", () => {
    const v = view([{ ...roundRow(1, 'confirmed', 300, 200, 1), edited_at: '2026-10-27T20:00:00Z' }, roundRow(2, 'confirmed', 50, 400, 1)])
    const rows = rowsOf(v)
    expect(rows.map((r) => [r.no, r.edited, r.round?.id])).toEqual([
      [2, false, 'r2'],
      [1, true, 'r1'],
    ])
    expect(rowsOf(v, [outboxItem('o3', 1, 2, 1)])[0]).toMatchObject({ edited: false, round: null })
  })

  it('says which team a pending round waits for', () => {
    const rows = rowsOf(view([roundRow(1, 'pending', 300, 200, 2)]))
    expect(rows[0]).toMatchObject({ status: 'pending', waitingFor: 'A' })
  })

  it('keeps voided rounds and shows cut bonuses with player names and teams', () => {
    const rows = rowsOf(view([roundRow(1, 'voided', 10, 20, 1), roundRow(2, 'open', null, null, null, [[4, 100]])]))
    expect(rows.map((r) => r.status)).toEqual(['open', 'voided'])
    expect(rows[0]!.bonuses).toEqual([{ key: 'l20', team: 'B', points: 100, name: 'U4', lineId: 'l20' }])
  })

  it('adds outbox rounds on top as sending, numbered after confirmed rounds', () => {
    const rows = rowsOf(view([roundRow(1, 'confirmed', 300, 200, 1)]), [outboxItem('o2', 5, 6, 2), outboxItem('o1', 1, 2, 1, [3])])
    expect(rows.map((r) => [r.key, r.status, r.no])).toEqual([
      ['o2', 'sending', 3],
      ['o1', 'sending', 2],
      ['r1', 'confirmed', 1],
    ])
    expect(rows[1]!.bonuses).toEqual([{ key: 'o1:3', team: 'A', points: 100, name: 'U3', lineId: null }])
  })

  it('folds the open deal into the first sending row so it is not listed twice', () => {
    const rows = rowsOf(view([roundRow(1, 'open', null, null, null, [[2, 100]])]), [outboxItem('o1', 1, 2, 1)])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 'o1', status: 'sending', no: 1 })
    expect(rows[0]!.bonuses.map((b) => b.name)).toEqual(['U2'])
  })
})

describe('bonusByTeam', () => {
  it('sums points per team', () => {
    expect(
      bonusByTeam([
        { team: 'A', points: 100 },
        { team: 'B', points: 100 },
        { team: 'A', points: 100 },
      ]),
    ).toEqual({ A: 200, B: 100 })
  })
})

describe('actionBlock', () => {
  const base = { live: true, resultProposed: false, hasPendingRound: false, awaitingMyConfirmation: false, sendingCount: 0 }

  it('allows scoring in the normal case', () => {
    expect(actionBlock(base)).toBeNull()
  })

  it('explains each block in priority order', () => {
    expect(actionBlock({ ...base, live: false, resultProposed: true })).toBe('notLive')
    expect(actionBlock({ ...base, resultProposed: true, hasPendingRound: true })).toBe('resultPending')
    expect(actionBlock({ ...base, hasPendingRound: true, awaitingMyConfirmation: true })).toBe('confirmFirst')
    expect(actionBlock({ ...base, hasPendingRound: true })).toBe('waitingOther')
    expect(actionBlock({ ...base, sendingCount: 1 })).toBe('sending')
  })

  it('names the opponent', () => {
    expect(opponentOf('A')).toBe('B')
    expect(opponentOf('B')).toBe('A')
  })
})
