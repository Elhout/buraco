import type { OutboxItem } from '../../../lib/outbox/core'
import { type GameRow, type GameView, type RoundRow, type SeatRow, buildGameView } from '../model'

/** Row builders for the live/result unit tests (plain data, no react-native). */

export const ME = 'u1'
const ts = '2026-10-19T20:00:00Z'

export const gameRow = (over: Partial<GameRow> = {}): GameRow => ({
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

export const seatRows: readonly SeatRow[] = [seat(1, 'A', 'u1', true), seat(2, 'B', 'u2', true), seat(3, 'A', 'u3'), seat(4, 'B', 'u4')]

export const roundRow = (
  no: number,
  status: RoundRow['status'],
  a: number | null,
  b: number | null,
  entered: number | null,
  lines: readonly (readonly [number, number])[] = [],
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
  edited_at: null,
  created_at: ts,
  round_lines: lines.map(([s, p], i) => ({ id: `l${no}${i}`, round_id: `r${no}`, type: 'cut_bonus', seat: s, points: p, created_at: ts })),
})

export const view = (rounds: readonly RoundRow[], over: Partial<GameRow> = {}): GameView =>
  buildGameView(gameRow(over), seatRows, rounds, ME, 'Guest')

export const outboxItem = (id: string, teamA: number, teamB: number, createdAt: number, cutSeats: readonly number[] = []): OutboxItem => ({
  id,
  kind: 'submit_round',
  payload: { gameId: 'g1', teamA, teamB, cutSeats, clientId: id },
  createdAt,
  attempts: 0,
  lastError: null,
})
