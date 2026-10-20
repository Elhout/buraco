import { MAX_ROUND_ABS } from '@buraco/shared'
import { describe, expect, it } from 'vitest'
import {
  type QuickGame,
  addRound,
  cleanTeamName,
  editRound,
  isOver,
  newQuickGame,
  parseQuickGame,
  quickOutcome,
  quickTotals,
  renameTeam,
  roundRows,
  setTarget,
  undoLastRound,
} from './model'

const play = (rounds: readonly [number, number][], start: QuickGame = newQuickGame()): QuickGame =>
  rounds.reduce((g, [a, b]) => {
    const r = addRound(g, a, b)
    if (!r.ok) throw new Error(r.error)
    return r.game
  }, start)

describe('newQuickGame', () => {
  it('starts empty at the club default target with no names', () => {
    expect(newQuickGame()).toEqual({ teamAName: '', teamBName: '', target: 2000, rounds: [] })
  })

  it('keeps names and target for a rematch', () => {
    const g = newQuickGame({ teamAName: 'Omar', teamBName: 'Sara', target: 1500 })
    expect(g).toEqual({ teamAName: 'Omar', teamBName: 'Sara', target: 1500, rounds: [] })
  })
})

describe('rounds and totals', () => {
  it('adds rounds, including negative ones, to running totals', () => {
    const g = play([
      [300, -120],
      [450, 600],
    ])
    expect(quickTotals(g)).toEqual({ A: 750, B: 480 })
    expect(roundRows(g)).toEqual([
      { n: 2, index: 1, round: { a: 450, b: 600 }, totals: { A: 750, B: 480 } },
      { n: 1, index: 0, round: { a: 300, b: -120 }, totals: { A: 300, B: -120 } },
    ])
  })

  it('rejects non-integers and absurd values', () => {
    expect(addRound(newQuickGame(), 10.5, 0)).toEqual({ ok: false, error: 'not_integer' })
    expect(addRound(newQuickGame(), 0, MAX_ROUND_ABS + 1)).toEqual({ ok: false, error: 'out_of_range' })
  })

  it('undoes the last round', () => {
    const g = undoLastRound(
      play([
        [100, 200],
        [300, 400],
      ]),
    )
    expect(quickTotals(g)).toEqual({ A: 100, B: 200 })
    expect(undoLastRound(newQuickGame()).rounds).toEqual([])
  })

  it('edits any round and the totals follow', () => {
    const g = play([
      [100, 200],
      [300, 400],
    ])
    const r = editRound(g, 0, 150, 200)
    expect(r.ok && quickTotals(r.game)).toEqual({ A: 450, B: 600 })
    expect(editRound(g, 5, 0, 0)).toEqual({ ok: false, error: 'no_round' })
    expect(editRound(g, 0, 1.5, 0)).toEqual({ ok: false, error: 'not_integer' })
  })
})

describe('outcome', () => {
  it('ends when a team reaches the target; the higher total wins', () => {
    const g = play([
      [1200, 900],
      [900, 1300],
    ])
    expect(quickOutcome(g)).toEqual({ kind: 'won', winner: 'B' })
    expect(isOver(g)).toBe(true)
    expect(addRound(g, 10, 10)).toEqual({ ok: false, error: 'game_over' })
  })

  it('keeps going on a tie at the target', () => {
    const g = play([[2000, 2000]])
    expect(quickOutcome(g)).toEqual({ kind: 'tie_at_target' })
    expect(isOver(g)).toBe(false)
    expect(quickOutcome(play([[50, 0]], g))).toEqual({ kind: 'won', winner: 'A' })
  })

  it('reopens the game when the winning round is undone or edited down', () => {
    const g = play([[2100, 0]])
    expect(isOver(undoLastRound(g))).toBe(false)
    const r = editRound(g, 0, 1000, 0)
    expect(r.ok && isOver(r.game)).toBe(false)
  })

  it('uses the chosen target', () => {
    const g = play([[1600, 0]], setTarget(newQuickGame(), 1500))
    expect(isOver(g)).toBe(true)
    expect(setTarget(newQuickGame(), 50).target).toBe(2000)
    expect(setTarget(newQuickGame(), 2500.5).target).toBe(2000)
  })
})

describe('team names', () => {
  it('are optional, trimmed and capped', () => {
    expect(cleanTeamName('  Abu   Ali  ')).toBe('Abu Ali')
    expect(cleanTeamName('x'.repeat(40))).toHaveLength(24)
    const g = renameTeam(renameTeam(newQuickGame(), 'A', ' الصقور '), 'B', '')
    expect(g.teamAName).toBe('الصقور')
    expect(g.teamBName).toBe('')
  })
})

describe('parseQuickGame', () => {
  it('round-trips a saved game', () => {
    const g = play([[100, -50]], renameTeam(newQuickGame(), 'A', 'Omar'))
    expect(parseQuickGame(JSON.stringify(g))).toEqual(g)
  })

  it('drops anything malformed', () => {
    expect(parseQuickGame(null)).toBeNull()
    expect(parseQuickGame('not json')).toBeNull()
    expect(parseQuickGame(JSON.stringify({ target: 5, rounds: [] }))).toBeNull()
    expect(parseQuickGame(JSON.stringify({ target: 2000, rounds: [{ a: 1 }] }))).toBeNull()
    expect(parseQuickGame(JSON.stringify({ target: 2000, rounds: [{ a: 1e9, b: 0 }] }))).toBeNull()
  })
})
