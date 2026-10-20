import { describe, expect, it } from 'vitest'
import { type GameRow, type RoundRow, type SeatRow, buildGameView } from './model'

const ME = 'u1'
const ts = '2026-10-19T20:00:00Z'

const game = (over: Partial<GameRow> = {}): GameRow => ({
  id: 'g1',
  club_id: 'c1',
  host_id: ME,
  mode: 'normal',
  status: 'live',
  config_snapshot: { target_score: 2000, cut_bonus: 100, allow_negative: true },
  verified: false,
  winner_team: null,
  started_at: ts,
  finished_at: null,
  tournament_match_id: null,
  created_at: ts,
  invite_expires_at: null,
  invite_warned_at: null,
  proposed_winner: null,
  result_proposed_at: null,
  result_confirmed_teams: [],
  undo_requested_by: null,
  undo_requested_at: null,
  abandon_approvals: [],
  clock_expired_at: null,
  ...over,
})

const seat = (n: number, team: 'A' | 'B', user: string | null, keeper = false): SeatRow => ({
  game_id: 'g1',
  seat: n,
  team,
  user_id: user,
  guest_name: user ? null : `Guest${n}`,
  invite_status: 'confirmed',
  confirmed_at: ts,
  is_scorekeeper: keeper,
  verified_at: null,
  created_at: ts,
  profiles: user ? { display_name: user.toUpperCase(), avatar_url: null } : null,
})

const seats = [seat(1, 'A', 'u1', true), seat(2, 'B', 'u2', true), seat(3, 'A', 'u3'), seat(4, 'B', null)]

const round = (
  no: number,
  status: RoundRow['status'],
  a: number | null,
  b: number | null,
  entered: number | null,
  lines: [number, number][] = [],
): RoundRow => ({
  id: `r${no}`,
  game_id: 'g1',
  round_no: no,
  team_a_score: a,
  team_b_score: b,
  entered_by_seat: entered,
  status,
  confirmed_by_seat: status === 'confirmed' ? 2 : null,
  confirmed_at: status === 'confirmed' ? ts : null,
  client_id: null,
  created_at: ts,
  round_lines: lines.map(([s, p], i) => ({ id: `l${no}${i}`, round_id: `r${no}`, type: 'cut_bonus', seat: s, points: p, created_at: ts })),
})

describe('buildGameView', () => {
  it('totals only confirmed rounds, including cut bonuses on the right team', () => {
    const v = buildGameView(game(), seats, [round(1, 'confirmed', 300, 200, 1, [[2, 100]]), round(2, 'pending', 900, 0, 1)], ME, 'Guest')
    expect(v.totals).toEqual({ A: 300, B: 300 })
    expect(v.rounds[0]!.withBonus).toEqual({ A: 300, B: 300 })
    expect(v.pendingRound?.id).toBe('r2')
  })

  it('numbers rounds by confirmed position so voided rounds leave no gap', () => {
    const v = buildGameView(
      game(),
      seats,
      [round(1, 'voided', 10, 10, 1), round(2, 'confirmed', 10, 10, 1), round(3, 'open', null, null, null)],
      ME,
      'Guest',
    )
    expect(v.rounds.map((r) => r.displayNo)).toEqual([1, 1, 2])
  })

  it('names guests and marks my seat', () => {
    const v = buildGameView(game(), seats, [], ME, 'Guest')
    expect(v.seats.map((s) => s.name)).toEqual(['U1', 'U2', 'U3', 'Guest4'])
    expect(v.mySeat?.seat).toBe(1)
    expect(v.myTeam).toBe('A')
  })

  it('asks me to confirm only rounds the other team entered', () => {
    const theirs = buildGameView(game(), seats, [round(1, 'pending', 1, 1, 2)], ME, 'Guest')
    expect(theirs.awaitingMyConfirmation?.id).toBe('r1')
    const mine = buildGameView(game(), seats, [round(1, 'pending', 1, 1, 1)], ME, 'Guest')
    expect(mine.awaitingMyConfirmation).toBeNull()
  })

  it('lets only scorekeepers score a normal game, and only the host a ghost game', () => {
    expect(buildGameView(game(), seats, [], ME, 'Guest').canScore).toBe(true)
    expect(buildGameView(game(), seats, [], 'u3', 'Guest').canScore).toBe(false)
    const ghost = game({ mode: 'ghost', host_id: 'u9' })
    expect(buildGameView(ghost, seats, [], ME, 'Guest').canScore).toBe(false)
    expect(buildGameView(ghost, seats, [], 'u9', 'Guest').canScore).toBe(true)
    expect(buildGameView(game({ status: 'finished' }), seats, [], ME, 'Guest').canScore).toBe(false)
  })

  it('tracks the final result and which team still has to confirm it', () => {
    const proposed = game({ result_proposed_at: ts, proposed_winner: 'A', result_confirmed_teams: ['A'] })
    expect(buildGameView(proposed, seats, [], ME, 'Guest').awaitingMyResult).toBe(false)
    expect(buildGameView(proposed, seats, [], 'u2', 'Guest').awaitingMyResult).toBe(true)
  })

  it('asks the other team to approve an undo', () => {
    const g = game({ undo_requested_by: 'A' })
    expect(buildGameView(g, seats, [], ME, 'Guest').awaitingMyUndo).toBe(false)
    expect(buildGameView(g, seats, [], 'u2', 'Guest').awaitingMyUndo).toBe(true)
  })

  it('reports the outcome from the frozen config', () => {
    const g = game({ config_snapshot: { target_score: 500, cut_bonus: 100, allow_negative: true } })
    const v = buildGameView(g, seats, [round(1, 'confirmed', 600, 100, 1)], ME, 'Guest')
    expect(v.outcome).toEqual({ kind: 'won', winner: 'A' })
  })
})
