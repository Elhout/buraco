import type { Views } from '@buraco/shared'
import { describe, expect, it } from 'vitest'
import {
  clockState,
  findMyTable,
  hasLiveBye,
  indexFor,
  isClosed,
  matchHref,
  needsResult,
  normalizeEntries,
  normalizeMatches,
  roundGroups,
} from './model'
import { match, pairs, round } from './testFixtures'
import type { TournamentData, TournamentRow } from './types'
import { joinNames } from './units'

const tournament: TournamentRow = {
  id: 't1',
  club_id: 'c1',
  organizer_id: 'u-e1',
  name: 'Cup',
  starts_on: '2026-10-19',
  format: 'swiss',
  pairing: 'fixed',
  round_minutes: 45,
  target_score: 1500,
  status: 'running',
  season_id: null,
  created_at: '2026-10-19T18:00:00Z',
}

const data = (over: Partial<TournamentData> = {}): TournamentData => ({
  tournament,
  entries: pairs(3),
  rounds: [round(1), round(2, { status: 'live', byes: ['p3'] })],
  matches: [
    match(1, 1, ['e1', 'e2'], ['e5', 'e6'], { result: 'a' }),
    match(2, 1, ['e3', 'e4'], ['e1', 'e2'], { roundId: 'r2', gameStatus: 'inviting' }),
  ],
  events: [],
  ...over,
})

describe('normalizers', () => {
  it('drops view rows without identity and defaults nullable columns', () => {
    const row = {
      match_id: 'm1',
      tournament_id: 't1',
      round_id: 'r1',
      round_no: 1,
      round_status: null,
      ends_at: null,
      table_no: 2,
      team_a_entries: null,
      team_b_entries: ['x'],
      team_a_names: null,
      team_b_names: null,
      result: null,
      points_a: null,
      points_b: null,
      edited_reason: null,
      game_id: 'g',
      game_status: 'live',
      live_a: null,
      live_b: 120,
    } satisfies Views<'v_tournament_matches'>
    const rows = normalizeMatches([row, { ...row, match_id: null }])
    expect(rows).toEqual([expect.objectContaining({ matchId: 'm1', roundStatus: 'live', endsAt: '', teamA: [], liveA: 0, liveB: 120 })])
  })

  it('names entries by profile, else by ghost-seat name', () => {
    const rows = normalizeEntries([
      { id: '1', user_id: 'u', guest_name: null, pair_id: null, seed: 1, profiles: { display_name: 'Omar' } },
      { id: '2', user_id: null, guest_name: 'Ghost', pair_id: null, seed: 2, profiles: null },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Omar', 'Ghost'])
  })
})

describe('my table', () => {
  it('finds my seat, partner and opponents in the live round', () => {
    const d = data()
    const mine = findMyTable(d, 'u-e1', indexFor(d))
    expect(mine).toMatchObject({ roundNo: 2, tableNo: 1, partner: 'E2', opponents: ['E3', 'E4'], team: 'B' })
  })

  it('is null when not seated and reports a bye', () => {
    const d = data()
    expect(findMyTable(d, 'u-e5', indexFor(d))).toBeNull()
    expect(hasLiveBye(d, 'u-e5', indexFor(d))).toBe(true)
    expect(hasLiveBye(d, 'u-e1', indexFor(d))).toBe(false)
    expect(findMyTable(data({ rounds: [round(1)] }), 'u-e1', indexFor(d))).toBeNull()
  })

  it('links to the invite while I still have to accept, else to the game', () => {
    const m = data().matches[1]!
    expect(matchHref(m, new Set(['e1']))).toBe(`/game/${m.gameId}/invite`)
    expect(matchHref(m, new Set(['e9']))).toBe(`/game/${m.gameId}`)
    expect(matchHref({ ...m, gameId: null }, new Set())).toBeNull()
  })
})

describe('rounds and clock', () => {
  it('groups tables by round, newest first', () => {
    const d = data()
    expect(roundGroups(d.rounds, d.matches).map((g) => [g.round.round_no, g.matches.length])).toEqual([
      [2, 1],
      [1, 1],
    ])
  })

  it('turns warning under 5 minutes, danger under 1, then over', () => {
    const end = '2026-10-19T19:00:00Z'
    const at = (min: number) => new Date(end).getTime() - min * 60_000
    expect(clockState(end, at(10)).tone).toBe('calm')
    expect(clockState(end, at(4)).tone).toBe('warning')
    expect(clockState(end, at(0.5)).tone).toBe('danger')
    expect(clockState(end, at(-1))).toEqual({ msLeft: 0, tone: 'over' })
    expect(clockState('', 0).tone).toBe('over')
  })
})

describe('joinNames', () => {
  it('joins names for sentences', () => {
    expect(joinNames([], 'and')).toBe('')
    expect(joinNames(['Omar'], 'and')).toBe('Omar')
    expect(joinNames(['Omar', '', 'Sara'], 'and')).toBe('Omar and Sara')
    expect(joinNames(['A', 'B', 'C'], 'and')).toBe('A, B and C')
  })
})

describe('needsResult / isClosed', () => {
  it('flags matches whose game ended without a result', () => {
    const m = match(1, 1, ['a', 'b'], ['c', 'd'])
    expect(needsResult({ ...m, gameStatus: 'expired' })).toBe(true)
    expect(needsResult({ ...m, gameStatus: 'abandoned' })).toBe(true)
    expect(needsResult({ ...m, gameStatus: 'abandoned', result: 'a' })).toBe(false)
    expect(needsResult(m)).toBe(false)
  })

  it('closes finished and cancelled tournaments', () => {
    expect(isClosed('finished')).toBe(true)
    expect(isClosed('cancelled')).toBe(true)
    expect(isClosed('running')).toBe(false)
  })
})
