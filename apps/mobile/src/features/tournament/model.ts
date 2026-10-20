import type { Views } from '@buraco/shared'
import type { EntryView, MatchView, RoundRow, TournamentData } from './types'
import { type UnitIndex, buildUnitIndex } from './units'

/** Pure view-model helpers for the tournament detail screen. */

type MatchViewRow = Views<'v_tournament_matches'>

/** View rows have nullable columns; rows missing their identity are dropped. */
export function normalizeMatches(rows: readonly MatchViewRow[]): MatchView[] {
  return rows.flatMap((r) => {
    if (r.match_id === null || r.round_id === null || r.round_no === null || r.table_no === null) return []
    return [
      {
        matchId: r.match_id,
        roundId: r.round_id,
        roundNo: r.round_no,
        roundStatus: r.round_status ?? 'live',
        endsAt: r.ends_at ?? '',
        tableNo: r.table_no,
        teamA: r.team_a_entries ?? [],
        teamB: r.team_b_entries ?? [],
        result: r.result,
        pointsA: r.points_a,
        pointsB: r.points_b,
        editedReason: r.edited_reason,
        gameId: r.game_id,
        gameStatus: r.game_status,
        liveA: r.live_a ?? 0,
        liveB: r.live_b ?? 0,
      },
    ]
  })
}

export interface EntryRowWithProfile {
  readonly id: string
  readonly user_id: string | null
  readonly guest_name: string | null
  readonly pair_id: string | null
  readonly seed: number | null
  readonly profiles: { readonly display_name: string } | null
}

export const normalizeEntries = (rows: readonly EntryRowWithProfile[]): EntryView[] =>
  rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    guestName: r.guest_name,
    pairId: r.pair_id,
    seed: r.seed,
    name: r.profiles?.display_name ?? r.guest_name ?? '',
  }))

export const liveRound = (rounds: readonly RoundRow[]): RoundRow | null => rounds.find((r) => r.status === 'live') ?? null

export interface RoundGroup {
  readonly round: RoundRow
  readonly matches: readonly MatchView[]
}

/** Rounds newest first, each with its tables in order. */
export function roundGroups(rounds: readonly RoundRow[], matches: readonly MatchView[]): RoundGroup[] {
  return [...rounds]
    .sort((a, b) => b.round_no - a.round_no)
    .map((round) => ({
      round,
      matches: matches.filter((m) => m.roundId === round.id).sort((a, b) => a.tableNo - b.tableNo),
    }))
}

export interface MyTable {
  readonly roundNo: number
  readonly tableNo: number
  readonly partner: string
  readonly opponents: readonly string[]
  readonly team: 'A' | 'B'
  readonly match: MatchView
}

/** Where I sit in the live round ("Round 3, Table 2: you and X vs Y and Z"); null when not seated. */
export function findMyTable(data: TournamentData, userId: string, index: UnitIndex): MyTable | null {
  const live = liveRound(data.rounds)
  const mine = data.entries.find((e) => e.userId === userId)
  if (!live || !mine) return null
  const match = data.matches.find((m) => m.roundId === live.id && (m.teamA.includes(mine.id) || m.teamB.includes(mine.id)))
  if (!match) return null
  const team = match.teamA.includes(mine.id) ? 'A' : 'B'
  const own = team === 'A' ? match.teamA : match.teamB
  const other = team === 'A' ? match.teamB : match.teamA
  return {
    roundNo: live.round_no,
    tableNo: match.tableNo,
    partner: index.entryName(own.find((id) => id !== mine.id) ?? ''),
    opponents: other.map(index.entryName),
    team,
    match,
  }
}

/** True when my unit sits out the live round. */
export function hasLiveBye(data: TournamentData, userId: string, index: UnitIndex): boolean {
  const live = liveRound(data.rounds)
  const mine = data.entries.find((e) => e.userId === userId)
  return live !== null && mine !== undefined && live.byes.includes(index.unitOf(mine.id))
}

export const isSeated = (match: MatchView, entryIds: ReadonlySet<string>): boolean =>
  [...match.teamA, ...match.teamB].some((id) => entryIds.has(id))

/** Where tapping a table goes: the invite screen while I still have to accept, else the game. */
export function matchHref(match: MatchView, myEntryIds: ReadonlySet<string>): string | null {
  if (match.gameId === null) return null
  if (match.gameStatus === 'inviting' && isSeated(match, myEntryIds)) return `/game/${match.gameId}/invite`
  return `/game/${match.gameId}`
}

export type ClockTone = 'calm' | 'warning' | 'danger' | 'over'
export const WARNING_MS = 5 * 60_000
export const DANGER_MS = 60_000

/** Round clock: warning under 5 minutes, danger under 1, "time's up" after. */
export function clockState(endsAt: string, now: number): { readonly msLeft: number; readonly tone: ClockTone } {
  const msLeft = new Date(endsAt).getTime() - now
  if (Number.isNaN(msLeft) || msLeft <= 0) return { msLeft: 0, tone: 'over' }
  if (msLeft <= DANGER_MS) return { msLeft, tone: 'danger' }
  if (msLeft <= WARNING_MS) return { msLeft, tone: 'warning' }
  return { msLeft, tone: 'calm' }
}

export const indexFor = (data: TournamentData): UnitIndex => buildUnitIndex(data.entries, data.tournament.pairing)

/** A match whose game expired or was abandoned without a result: the organizer can enter one. */
export const needsResult = (match: MatchView): boolean =>
  match.result === null && (match.gameStatus === 'expired' || match.gameStatus === 'abandoned')

/** Organizer controls that change entries or results are closed once the tournament ends. */
export const isClosed = (status: TournamentData['tournament']['status']): boolean => status === 'finished' || status === 'cancelled'
