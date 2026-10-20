import { describe, expect, it } from 'vitest'
import { roundRow, view } from '../live/testFixtures'
import { resultSummary, shareParams } from './resultModel'

const rounds = [roundRow(1, 'confirmed', 1200, 900, 1), roundRow(2, 'voided', 5, 5, 1), roundRow(3, 'confirmed', 900, 300, 2)]
const names = { A: 'U1 · U3', B: 'U2 · U4' }

describe('resultSummary', () => {
  it('shows a proposed winner with per-team confirmations while live', () => {
    const s = resultSummary(view(rounds, { result_proposed_at: 'x', proposed_winner: 'A', result_confirmed_teams: ['B'] }))
    expect(s).toMatchObject({ kind: 'won', winner: 'A', final: false, roundsPlayed: 2, confirmed: { A: false, B: true } })
    expect(s.totals).toEqual({ A: 2100, B: 1200 })
  })

  it('treats a proposed result without a winner as a clock draw', () => {
    expect(resultSummary(view(rounds, { result_proposed_at: 'x', proposed_winner: null })).kind).toBe('draw')
  })

  it('is final and fully confirmed once finished', () => {
    const s = resultSummary(view(rounds, { status: 'finished', winner_team: 'B' }))
    expect(s).toMatchObject({ kind: 'won', winner: 'B', final: true, confirmed: { A: true, B: true } })
    expect(resultSummary(view(rounds, { status: 'finished', winner_team: null, tournament_match_id: 'm' })).kind).toBe('draw')
  })

  it('reports abandoned and in-progress games', () => {
    expect(resultSummary(view(rounds, { status: 'abandoned' })).kind).toBe('abandoned')
    expect(resultSummary(view(rounds)).kind).toBe('inProgress')
  })
})

describe('shareParams', () => {
  it('puts the winner first with the high score', () => {
    const p = shareParams(resultSummary(view(rounds, { status: 'finished', winner_team: 'B' })), names)
    expect(p).toEqual({ key: 'won', winnerTeam: 'B', winners: names.B, losers: names.A, high: 2100, low: 1200, count: 2 })
  })

  it('shares a draw in team order', () => {
    const p = shareParams(resultSummary(view(rounds, { status: 'finished', winner_team: null })), names)
    expect(p).toMatchObject({ key: 'draw', winnerTeam: null, winners: names.A, losers: names.B })
  })

  it('has nothing to share before the result is final', () => {
    expect(shareParams(resultSummary(view(rounds, { result_proposed_at: 'x', proposed_winner: 'A' })), names)).toBeNull()
    expect(shareParams(resultSummary(view(rounds, { status: 'abandoned' })), names)).toBeNull()
  })
})
