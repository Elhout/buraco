import type { Enums, Json, Tables } from '@buraco/shared'

/** Raw and normalized rows for the tournament feature. Pure types, no runtime code. */

export type TournamentRow = Tables<'tournaments'>
export type RoundRow = Tables<'tournament_rounds'>
export type TournamentFormat = Enums<'tournament_format'>
export type TournamentPairing = Enums<'tournament_pairing'>
export type TournamentStatus = Enums<'tournament_status'>
export type MatchResultValue = Enums<'match_result'>

/** An entrant with a display name resolved (profile name or ghost-seat guest name). */
export interface EntryView {
  readonly id: string
  readonly userId: string | null
  readonly guestName: string | null
  readonly pairId: string | null
  readonly seed: number | null
  readonly name: string
}

/** One row of v_tournament_matches with the nullable view columns resolved. */
export interface MatchView {
  readonly matchId: string
  readonly roundId: string
  readonly roundNo: number
  readonly roundStatus: Enums<'tournament_round_status'>
  readonly endsAt: string
  readonly tableNo: number
  readonly teamA: readonly string[]
  readonly teamB: readonly string[]
  readonly result: MatchResultValue | null
  readonly pointsA: number | null
  readonly pointsB: number | null
  readonly editedReason: string | null
  readonly gameId: string | null
  readonly gameStatus: Enums<'game_status'> | null
  readonly liveA: number
  readonly liveB: number
}

export interface EventRow {
  readonly id: string
  readonly type: string
  readonly actorId: string | null
  readonly payload: Json
  readonly createdAt: string
}

export interface TournamentData {
  readonly tournament: TournamentRow
  readonly entries: readonly EntryView[]
  readonly rounds: readonly RoundRow[]
  readonly matches: readonly MatchView[]
  readonly events: readonly EventRow[]
}
