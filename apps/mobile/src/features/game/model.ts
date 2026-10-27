import {
  type Enums,
  type GameOutcome,
  type ScoredRound,
  type ScoringConfig,
  type Tables,
  type Team,
  type Totals,
  configFromSnapshot,
  gameOutcome,
  totals,
} from '@buraco/shared'

/**
 * Pure view-model for one game, built from raw rows. Every game screen (lobby card, invite,
 * live, result, history detail) reads this, so the rules for "who may do what" live in one place.
 * Display only: results are decided by the database (confirm_round / confirm_result).
 */

export type GameRow = Tables<'games'>
export type SeatRow = Tables<'game_seats'> & { profiles: { display_name: string; avatar_url: string | null } | null }
export type RoundRow = Tables<'rounds'> & { round_lines: Tables<'round_lines'>[] }

export interface SeatView {
  readonly seat: number
  readonly team: Team
  readonly userId: string | null
  readonly name: string
  readonly avatarUrl: string | null
  readonly isGuest: boolean
  readonly inviteStatus: Enums<'invite_status'>
  readonly isScorekeeper: boolean
  readonly verified: boolean
  readonly isMe: boolean
}

export interface LineView {
  readonly id: string
  readonly seat: number
  readonly team: Team
  readonly points: number
  readonly playerName: string
}

export interface RoundView {
  readonly id: string
  readonly roundNo: number
  /** Position among confirmed rounds (voided rounds keep their round_no but don't count). */
  readonly displayNo: number
  readonly status: Enums<'round_status'>
  readonly teamA: number | null
  readonly teamB: number | null
  readonly lines: readonly LineView[]
  /** Score plus bonuses per team, for display. */
  readonly withBonus: Totals
  readonly enteredBy: SeatView | null
  readonly confirmedBy: SeatView | null
  readonly confirmedAt: string | null
  /** Set when the game's creator corrected this round (the owner's edits leave no mark). */
  readonly editedAt: string | null
}

export interface GameView {
  readonly game: GameRow
  readonly config: ScoringConfig
  readonly seats: readonly SeatView[]
  readonly rounds: readonly RoundView[]
  readonly totals: Totals
  readonly outcome: GameOutcome
  readonly mySeat: SeatView | null
  readonly myTeam: Team | null
  readonly isHost: boolean
  readonly isGhost: boolean
  /** The club trusted scorekeepers when this game started: start-now games count without PINs. */
  readonly trustsScorekeeper: boolean
  /** A start-now game in a club that asks players to confirm it with their PIN afterwards. */
  readonly needsVerification: boolean
  /** I can enter scores / tap cuts: ghost host, or my team's scorekeeper in a live normal game. */
  readonly canScore: boolean
  readonly openRound: RoundView | null
  readonly pendingRound: RoundView | null
  /** A pending round entered by the other team that I'm the one to confirm. */
  readonly awaitingMyConfirmation: RoundView | null
  readonly resultProposed: boolean
  /** Final result waiting for my team's confirmation. */
  readonly awaitingMyResult: boolean
  /** An undo the other team asked for that I'm the one to approve. */
  readonly awaitingMyUndo: boolean
  readonly myAbandonApproved: boolean
}

const teamOfSeat = (seats: readonly SeatView[], seat: number | null): SeatView | null =>
  seat === null ? null : (seats.find((s) => s.seat === seat) ?? null)

export function toSeatView(row: SeatRow, me: string | null, guestLabel: string): SeatView {
  return {
    seat: row.seat,
    team: row.team,
    userId: row.user_id,
    name: row.profiles?.display_name ?? row.guest_name ?? guestLabel,
    avatarUrl: row.profiles?.avatar_url ?? null,
    isGuest: row.user_id === null,
    inviteStatus: row.invite_status,
    isScorekeeper: row.is_scorekeeper,
    verified: row.verified_at !== null,
    isMe: me !== null && row.user_id === me,
  }
}

function toRoundView(row: RoundRow, seats: readonly SeatView[], displayNo: number): RoundView {
  const lines = [...row.round_lines]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((l) => {
      const seat = teamOfSeat(seats, l.seat)
      return { id: l.id, seat: l.seat, team: seat?.team ?? 'A', points: l.points, playerName: seat?.name ?? '' }
    })
  const bonus = (team: Team): number => lines.filter((l) => l.team === team).reduce((n, l) => n + l.points, 0)
  return {
    id: row.id,
    roundNo: row.round_no,
    displayNo,
    status: row.status,
    teamA: row.team_a_score,
    teamB: row.team_b_score,
    lines,
    withBonus: { A: (row.team_a_score ?? 0) + bonus('A'), B: (row.team_b_score ?? 0) + bonus('B') },
    enteredBy: teamOfSeat(seats, row.entered_by_seat),
    confirmedBy: teamOfSeat(seats, row.confirmed_by_seat),
    confirmedAt: row.confirmed_at,
    editedAt: row.edited_at,
  }
}

export function buildGameView(
  game: GameRow,
  seatRows: readonly SeatRow[],
  roundRows: readonly RoundRow[],
  me: string | null,
  guestLabel: string,
): GameView {
  const seats = [...seatRows].sort((a, b) => a.seat - b.seat).map((s) => toSeatView(s, me, guestLabel))
  const ordered = [...roundRows].sort((a, b) => a.round_no - b.round_no)
  let confirmedCount = 0
  const rounds = ordered.map((r) => {
    if (r.status === 'confirmed') confirmedCount += 1
    const displayNo = r.status === 'confirmed' ? confirmedCount : confirmedCount + 1
    return toRoundView(r, seats, displayNo)
  })

  const scored: ScoredRound[] = rounds.map((r) => ({
    teamAScore: r.teamA ?? 0,
    teamBScore: r.teamB ?? 0,
    status: r.status === 'open' ? 'pending' : r.status,
    lines: r.lines.map((l) => ({ team: l.team, points: l.points })),
  }))
  const config = configFromSnapshot(game.config_snapshot)
  const t = totals(scored)

  const mySeat = seats.find((s) => s.isMe) ?? null
  const isHost = me !== null && game.host_id === me
  const isGhost = game.mode === 'ghost'
  const snapshot = game.config_snapshot as { trust_ghost?: unknown } | null
  const trustsScorekeeper = snapshot?.trust_ghost === true
  const needsVerification = isGhost && !trustsScorekeeper
  const live = game.status === 'live'
  // Start-now games: anyone at the table can keep score (the server also lets the owner).
  const canScore = live && (isGhost ? isHost || mySeat !== null : Boolean(mySeat?.isScorekeeper))
  const openRound = rounds.find((r) => r.status === 'open') ?? null
  const pendingRound = rounds.find((r) => r.status === 'pending') ?? null
  const myTeam = mySeat?.team ?? null

  const awaitingMyConfirmation =
    pendingRound && canScore && (isGhost || (pendingRound.enteredBy !== null && pendingRound.enteredBy.team !== myTeam))
      ? pendingRound
      : null

  const resultProposed = live && game.result_proposed_at !== null
  const confirmedTeams = (game.result_confirmed_teams ?? []) as readonly Team[]
  const awaitingMyResult = resultProposed && canScore && (isGhost || (myTeam !== null && !confirmedTeams.includes(myTeam)))
  const awaitingMyUndo = live && !isGhost && canScore && game.undo_requested_by !== null && game.undo_requested_by !== myTeam
  const myAbandonApproved = myTeam !== null && ((game.abandon_approvals ?? []) as readonly Team[]).includes(myTeam)

  return {
    game,
    config,
    trustsScorekeeper,
    needsVerification,
    seats,
    rounds,
    totals: t,
    outcome: gameOutcome(t, config),
    mySeat,
    myTeam,
    isHost,
    isGhost,
    canScore,
    openRound,
    pendingRound,
    awaitingMyConfirmation,
    resultProposed,
    awaitingMyResult,
    awaitingMyUndo,
    myAbandonApproved,
  }
}

export const teamSeats = (view: GameView, team: Team): readonly SeatView[] => view.seats.filter((s) => s.team === team)
export const teamNames = (view: GameView, team: Team): string =>
  teamSeats(view, team)
    .map((s) => s.name)
    .join(' · ')
