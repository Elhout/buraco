import type { EntryView, MatchView, RoundRow } from './types'

/** Builders for the tournament unit tests (not used by the app). */

export const entry = (id: string, over: Partial<EntryView> = {}): EntryView => ({
  id,
  userId: `u-${id}`,
  guestName: null,
  pairId: null,
  seed: null,
  name: id.toUpperCase(),
  ...over,
})

/** n fixed pairs: entries e1..e(2n), pair p1..pn, seeded by pair. */
export const pairs = (n: number): EntryView[] =>
  Array.from({ length: n * 2 }, (_, i) => entry(`e${i + 1}`, { pairId: `p${Math.floor(i / 2) + 1}`, seed: Math.floor(i / 2) + 1 }))

export const players = (n: number): EntryView[] => Array.from({ length: n }, (_, i) => entry(`e${i + 1}`, { seed: i + 1 }))

export const round = (no: number, over: Partial<RoundRow> = {}): RoundRow => ({
  id: `r${no}`,
  tournament_id: 't1',
  round_no: no,
  starts_at: '2026-10-19T18:00:00Z',
  ends_at: '2026-10-19T18:45:00Z',
  status: 'finished',
  byes: [],
  clock_warned_at: null,
  clock_expired_at: null,
  created_at: '2026-10-19T18:00:00Z',
  ...over,
})

export const match = (roundNo: number, tableNo: number, teamA: string[], teamB: string[], over: Partial<MatchView> = {}): MatchView => ({
  matchId: `m${roundNo}-${tableNo}`,
  roundId: `r${roundNo}`,
  roundNo,
  roundStatus: 'finished',
  endsAt: '2026-10-19T18:45:00Z',
  tableNo,
  teamA,
  teamB,
  result: null,
  pointsA: null,
  pointsB: null,
  editedReason: null,
  gameId: `g${roundNo}-${tableNo}`,
  gameStatus: 'live',
  liveA: 0,
  liveB: 0,
  ...over,
})
