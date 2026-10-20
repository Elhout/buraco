import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type ScoredRound, gameOutcome, isFinished, pointsToGo, totals, validateRoundScore, winner } from './scoring'

const round = (a: number, b: number, extra: Partial<ScoredRound> = {}): ScoredRound => ({
  teamAScore: a,
  teamBScore: b,
  status: 'confirmed',
  lines: [],
  ...extra,
})

describe('totals', () => {
  it('returns zero for both teams when there are no rounds', () => {
    expect(totals([])).toEqual({ A: 0, B: 0 })
  })

  it('sums confirmed round scores per team, including negatives', () => {
    expect(totals([round(350, 220), round(-50, 400)])).toEqual({ A: 300, B: 620 })
  })

  it('adds exact-cut bonus lines to the team that earned them', () => {
    const r = round(100, 200, {
      lines: [
        { team: 'A', points: 100 },
        { team: 'A', points: 100 },
        { team: 'B', points: 100 },
      ],
    })
    expect(totals([r])).toEqual({ A: 300, B: 300 })
  })

  it('ignores pending and voided rounds', () => {
    const rounds = [
      round(500, 500),
      round(900, 0, { status: 'pending' }),
      round(0, 900, { status: 'voided', lines: [{ team: 'B', points: 100 }] }),
    ]
    expect(totals(rounds)).toEqual({ A: 500, B: 500 })
  })

  it('does not mutate its input', () => {
    const rounds = Object.freeze([Object.freeze(round(10, 20))])
    expect(() => totals(rounds)).not.toThrow()
  })
})

describe('isFinished / winner / gameOutcome', () => {
  const cfg = DEFAULT_CONFIG

  it('is not finished while both teams are below target', () => {
    expect(isFinished({ A: 1990, B: 1500 }, cfg)).toBe(false)
    expect(winner({ A: 1990, B: 1500 }, cfg)).toBeNull()
    expect(gameOutcome({ A: 1990, B: 1500 }, cfg)).toEqual({ kind: 'in_progress' })
  })

  it('finishes when one team reaches exactly the target', () => {
    expect(isFinished({ A: 2000, B: 1500 }, cfg)).toBe(true)
    expect(winner({ A: 2000, B: 1500 }, cfg)).toBe('A')
  })

  it('awards the higher total when both teams are over target', () => {
    expect(winner({ A: 2100, B: 2250 }, cfg)).toBe('B')
    expect(gameOutcome({ A: 2100, B: 2250 }, cfg)).toEqual({ kind: 'won', winner: 'B' })
  })

  it('keeps the game live on an equal total at or over target', () => {
    expect(isFinished({ A: 2050, B: 2050 }, cfg)).toBe(false)
    expect(winner({ A: 2050, B: 2050 }, cfg)).toBeNull()
    expect(gameOutcome({ A: 2050, B: 2050 }, cfg)).toEqual({ kind: 'tie_at_target' })
  })

  it('treats an equal total below target as simply in progress', () => {
    expect(gameOutcome({ A: 800, B: 800 }, cfg)).toEqual({ kind: 'in_progress' })
  })

  it('respects a custom target from the config snapshot', () => {
    const tournament = { ...cfg, targetScore: 1500 }
    expect(winner({ A: 1400, B: 1520 }, tournament)).toBe('B')
    expect(winner({ A: 1400, B: 1520 }, cfg)).toBeNull()
  })
})

describe('pointsToGo', () => {
  it('returns the remaining points to the target', () => {
    expect(pointsToGo(1650, DEFAULT_CONFIG)).toBe(350)
  })

  it('never goes below zero', () => {
    expect(pointsToGo(2300, DEFAULT_CONFIG)).toBe(0)
  })

  it('counts negative totals as further away', () => {
    expect(pointsToGo(-100, DEFAULT_CONFIG)).toBe(2100)
  })
})

describe('validateRoundScore', () => {
  it('accepts integers, including negatives by default', () => {
    expect(validateRoundScore(350, DEFAULT_CONFIG)).toEqual({ ok: true })
    expect(validateRoundScore(-150, DEFAULT_CONFIG)).toEqual({ ok: true })
    expect(validateRoundScore(0, DEFAULT_CONFIG)).toEqual({ ok: true })
  })

  it('rejects negatives when the club disallows them', () => {
    expect(validateRoundScore(-10, { ...DEFAULT_CONFIG, allowNegative: false })).toEqual({
      ok: false,
      error: 'negative_not_allowed',
    })
  })

  it('rejects non-integers and non-finite numbers', () => {
    expect(validateRoundScore(12.5, DEFAULT_CONFIG)).toEqual({ ok: false, error: 'not_integer' })
    expect(validateRoundScore(Number.NaN, DEFAULT_CONFIG)).toEqual({ ok: false, error: 'not_integer' })
    expect(validateRoundScore(Infinity, DEFAULT_CONFIG)).toEqual({ ok: false, error: 'not_integer' })
  })

  it('rejects absurdly large values', () => {
    expect(validateRoundScore(100_000, DEFAULT_CONFIG)).toEqual({ ok: false, error: 'out_of_range' })
    expect(validateRoundScore(-100_000, DEFAULT_CONFIG)).toEqual({ ok: false, error: 'out_of_range' })
  })
})
