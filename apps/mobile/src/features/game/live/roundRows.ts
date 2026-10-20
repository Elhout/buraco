import type { Team } from '@buraco/shared'
import type { OutboxItem } from '../../../lib/outbox/core'
import type { LineView, RoundView, SeatView } from '../model'

/**
 * Presentation model for the live round list: rounds newest first, plus rows for rounds still
 * in the outbox ("Sending…"). Pure, so the row rules are unit-tested.
 */

export type RowStatus = 'open' | 'pending' | 'confirmed' | 'voided' | 'sending'

export interface BonusChip {
  readonly key: string
  readonly team: Team
  readonly points: number
  readonly name: string
  /** Cut line id; null for cuts that only exist in the outbox. */
  readonly lineId: string | null
}

export interface RoundRowModel {
  readonly key: string
  readonly no: number
  readonly status: RowStatus
  readonly a: number | null
  readonly b: number | null
  readonly bonuses: readonly BonusChip[]
  /** Team whose confirmation a pending round waits for. */
  readonly waitingFor: Team | null
  readonly enteredBy: string | null
  readonly confirmedBy: string | null
}

const otherTeam = (team: Team): Team => (team === 'A' ? 'B' : 'A')

const chipFromLine = (line: LineView): BonusChip => ({
  key: line.id,
  team: line.team,
  points: line.points,
  name: line.playerName,
  lineId: line.id,
})

function rowFromRound(round: RoundView): RoundRowModel {
  return {
    key: round.id,
    no: round.displayNo,
    status: round.status,
    a: round.teamA,
    b: round.teamB,
    bonuses: round.lines.map(chipFromLine),
    waitingFor: round.status === 'pending' && round.enteredBy ? otherTeam(round.enteredBy.team) : null,
    enteredBy: round.enteredBy?.name ?? null,
    confirmedBy: round.confirmedBy?.name ?? null,
  }
}

function rowFromOutbox(item: OutboxItem, no: number, seats: readonly SeatView[], cutBonus: number): RoundRowModel {
  const bonuses = item.payload.cutSeats.flatMap((seatNo): BonusChip[] => {
    const seat = seats.find((s) => s.seat === seatNo)
    return seat ? [{ key: `${item.id}:${seatNo}`, team: seat.team, points: cutBonus, name: seat.name, lineId: null }] : []
  })
  return {
    key: item.id,
    no,
    status: 'sending',
    a: item.payload.teamA,
    b: item.payload.teamB,
    bonuses,
    waitingFor: null,
    enteredBy: null,
    confirmedBy: null,
  }
}

export interface RoundRowsInput {
  readonly rounds: readonly RoundView[]
  readonly seats: readonly SeatView[]
  readonly outbox: readonly OutboxItem[]
  readonly cutBonus: number
}

/**
 * Newest first. A queued round fills the deal currently open on the server, so while one is
 * sending the open row is folded into it (its tapped cuts show on the "Sending…" row).
 */
export function buildRoundRows({ rounds, seats, outbox, cutBonus }: RoundRowsInput): readonly RoundRowModel[] {
  const sending = [...outbox].sort((x, y) => x.createdAt - y.createdAt)
  const open = rounds.find((r) => r.status === 'open') ?? null
  const fold = open !== null && sending.length > 0
  const confirmed = rounds.filter((r) => r.status === 'confirmed').length
  const serverRows = rounds.filter((r) => !(fold && r.id === open.id)).map(rowFromRound)
  const sendingRows = sending.map((item, i) => {
    const row = rowFromOutbox(item, confirmed + 1 + i, seats, cutBonus)
    return i === 0 && fold ? { ...row, bonuses: [...open.lines.map(chipFromLine), ...row.bonuses] } : row
  })
  return [...serverRows, ...sendingRows].reverse()
}

/** Total bonus points per team in a list of cut lines (the deal being played). */
export function bonusByTeam(lines: readonly { readonly team: Team; readonly points: number }[]): { A: number; B: number } {
  return lines.reduce((acc, l) => (l.team === 'A' ? { ...acc, A: acc.A + l.points } : { ...acc, B: acc.B + l.points }), { A: 0, B: 0 })
}
