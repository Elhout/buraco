import { describe, expect, it } from 'vitest'
import type { RoundView } from '@/features/game/model'
import { runningTotals } from './runningTotals'

const round = (id: string, roundNo: number, status: RoundView['status'], a: number, b: number): RoundView => ({
  id,
  roundNo,
  displayNo: roundNo,
  status,
  teamA: a,
  teamB: b,
  lines: [],
  withBonus: { A: a, B: b },
  enteredBy: null,
  confirmedBy: null,
  confirmedAt: null,
  editedAt: null,
})

describe('runningTotals', () => {
  it('adds up counted rounds in order, bonuses included', () => {
    const rounds = [round('r2', 2, 'confirmed', 300, 380), round('r1', 1, 'confirmed', 400, 500), round('r3', 3, 'confirmed', 140, 1110)]
    const t = runningTotals(rounds)
    expect([t.get('r1'), t.get('r2'), t.get('r3')]).toEqual([
      { A: 400, B: 500 },
      { A: 700, B: 880 },
      { A: 840, B: 1990 },
    ])
  })

  it('skips undone and unconfirmed rounds', () => {
    const t = runningTotals([
      round('r1', 1, 'confirmed', 100, 0),
      round('r2', 2, 'voided', 999, 999),
      round('r3', 3, 'confirmed', 50, 20),
      round('r4', 4, 'pending', 1, 1),
    ])
    expect(t.get('r2')).toBeUndefined()
    expect(t.get('r4')).toBeUndefined()
    expect(t.get('r3')).toEqual({ A: 150, B: 20 })
  })
})
