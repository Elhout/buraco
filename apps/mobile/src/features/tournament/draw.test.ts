import { describe, expect, it } from 'vitest'
import { nextDraw, toStartRoundArgs } from './draw'
import { match, pairs, players, round } from './testFixtures'
import { buildUnitIndex } from './units'

const fixed = (n: number) => buildUnitIndex(pairs(n), 'fixed')
const solo = (n: number) => buildUnitIndex(players(n), 'rotating')

describe('nextDraw', () => {
  it('waits while a round is live', () => {
    const draw = nextDraw({
      format: 'swiss',
      pairing: 'fixed',
      index: fixed(4),
      matches: [],
      rounds: [round(1, { status: 'live' })],
      seed: 1,
    })
    expect(draw).toEqual({ kind: 'waiting' })
  })

  it('walks the round-robin schedule, then completes', () => {
    const index = fixed(4)
    const first = nextDraw({ format: 'round_robin', pairing: 'fixed', index, matches: [], rounds: [], seed: 1 })
    expect(first).toMatchObject({ kind: 'ready', roundNo: 1, random: false })
    if (first.kind === 'ready') expect(first.plan.matches).toHaveLength(2)
    const done = nextDraw({ format: 'round_robin', pairing: 'fixed', index, matches: [], rounds: [round(1), round(2), round(3)], seed: 1 })
    expect(done).toEqual({ kind: 'complete', champion: null })
  })

  it('gives a round-robin bye with an odd number of pairs', () => {
    const draw = nextDraw({ format: 'round_robin', pairing: 'fixed', index: fixed(3), matches: [], rounds: [], seed: 1 })
    expect(draw.kind === 'ready' && draw.plan.byes).toHaveLength(1)
  })

  it('makes Swiss round 1 random and reshufflable', () => {
    const index = fixed(8)
    const a = nextDraw({ format: 'swiss', pairing: 'fixed', index, matches: [], rounds: [], seed: 1 })
    const b = nextDraw({ format: 'swiss', pairing: 'fixed', index, matches: [], rounds: [], seed: 99 })
    expect(a).toMatchObject({ kind: 'ready', random: true })
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b))
  })

  it('pairs Swiss round 2 by results without rematches and gives the bye to someone new', () => {
    const index = fixed(3)
    const history = [match(1, 1, ['e1', 'e2'], ['e3', 'e4'], { result: 'a', pointsA: 500, pointsB: 100 })]
    const draw = nextDraw({ format: 'swiss', pairing: 'fixed', index, matches: history, rounds: [round(1, { byes: ['p3'] })], seed: 1 })
    expect(draw.kind).toBe('ready')
    if (draw.kind !== 'ready') return
    expect(draw.random).toBe(false)
    expect(draw.plan.byes).not.toContain('p3')
    expect([...draw.plan.matches[0]!.teamA, ...draw.plan.matches[0]!.teamB]).toContain('p3')
  })

  it('seats rotating partners in tables of four', () => {
    const draw = nextDraw({ format: 'swiss', pairing: 'rotating', index: solo(8), matches: [], rounds: [], seed: 3 })
    expect(draw).toMatchObject({ kind: 'ready', random: true })
    if (draw.kind === 'ready') expect(draw.plan.matches.every((m) => m.teamA.length === 2 && m.teamB.length === 2)).toBe(true)
  })

  it('refuses rotating counts that are not a multiple of 4, and rotating knockouts', () => {
    expect(nextDraw({ format: 'swiss', pairing: 'rotating', index: solo(6), matches: [], rounds: [], seed: 3 }).kind).toBe('invalid')
    expect(nextDraw({ format: 'knockout', pairing: 'rotating', index: solo(8), matches: [], rounds: [], seed: 3 }).kind).toBe('invalid')
  })

  it('ends a rotating round-robin once everyone could have partnered everyone', () => {
    const rounds = [round(1), round(2), round(3)]
    expect(nextDraw({ format: 'round_robin', pairing: 'rotating', index: solo(4), matches: [], rounds, seed: 3 })).toEqual({
      kind: 'complete',
      champion: null,
    })
  })

  it('runs a knockout from bracket to champion', () => {
    const index = fixed(3)
    const r1 = nextDraw({ format: 'knockout', pairing: 'fixed', index, matches: [], rounds: [], seed: 1 })
    expect(r1).toMatchObject({ kind: 'ready', plan: { byes: ['p1'] } })
    if (r1.kind !== 'ready') return
    expect(r1.plan.matches[0]).toEqual({ teamA: ['p2'], teamB: ['p3'] })

    const semi = match(1, 1, ['e3', 'e4'], ['e5', 'e6'], { result: 'b', pointsA: 100, pointsB: 900 })
    const r2 = nextDraw({ format: 'knockout', pairing: 'fixed', index, matches: [semi], rounds: [round(1, { byes: ['p1'] })], seed: 1 })
    expect(r2).toMatchObject({ kind: 'ready', roundNo: 2 })
    if (r2.kind !== 'ready') return
    expect(r2.plan.matches).toEqual([{ teamA: ['p1'], teamB: ['p3'] }])

    const final = match(2, 1, ['e1', 'e2'], ['e5', 'e6'], { roundId: 'r2', result: 'a', pointsA: 2000, pointsB: 10 })
    const rounds = [round(1, { byes: ['p1'] }), round(2)]
    expect(nextDraw({ format: 'knockout', pairing: 'fixed', index, matches: [semi, final], rounds, seed: 1 })).toEqual({
      kind: 'complete',
      champion: 'p1',
    })
  })

  it('cannot continue a knockout with an undecided match', () => {
    const open = match(1, 1, ['e1', 'e2'], ['e3', 'e4'], { result: 'draw' })
    expect(nextDraw({ format: 'knockout', pairing: 'fixed', index: fixed(2), matches: [open], rounds: [round(1)], seed: 1 }).kind).toBe(
      'invalid',
    )
  })

  it('refuses a field too small to play', () => {
    expect(nextDraw({ format: 'round_robin', pairing: 'fixed', index: fixed(1), matches: [], rounds: [], seed: 1 }).kind).toBe('invalid')
    expect(nextDraw({ format: 'swiss', pairing: 'fixed', index: fixed(1), matches: [], rounds: [], seed: 1 }).kind).toBe('invalid')
    expect(nextDraw({ format: 'knockout', pairing: 'fixed', index: fixed(1), matches: [], rounds: [], seed: 1 }).kind).toBe('invalid')
  })
})

describe('toStartRoundArgs', () => {
  it('expands pair units into both entry ids and keeps byes as units', () => {
    const args = toStartRoundArgs('t1', { matches: [{ teamA: ['p2'], teamB: ['p3'] }], byes: ['p1'] }, fixed(3))
    expect(args).toEqual({
      p_tournament_id: 't1',
      p_matches: [{ table_no: 1, team_a: ['e3', 'e4'], team_b: ['e5', 'e6'] }],
      p_byes: ['p1'],
    })
  })

  it('passes rotating entry ids straight through', () => {
    const args = toStartRoundArgs('t1', { matches: [{ teamA: ['e1', 'e2'], teamB: ['e3', 'e4'] }], byes: [] }, solo(4))
    expect(args.p_matches[0]).toEqual({ table_no: 1, team_a: ['e1', 'e2'], team_b: ['e3', 'e4'] })
  })
})
