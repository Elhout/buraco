import type { Team } from '@buraco/shared'

/**
 * Audit log: game_events rows → a translation key plus its values. Pure (tested); the screen
 * passes the lookups (seat and member names, round numbers, number formatting) in.
 */

export interface EventRow {
  readonly id: string
  readonly type: string
  readonly actor_seat: number | null
  readonly actor_id: string | null
  readonly payload: unknown
  readonly created_at: string
}

export type EventKey =
  | 'created'
  | 'roundEdited'
  | 'createdGhost'
  | 'createdTournament'
  | 'live'
  | 'inviteAccepted'
  | 'inviteDeclined'
  | 'seatSwapped'
  | 'switchedToGhost'
  | 'cancelled'
  | 'expired'
  | 'roundDisputed'
  | 'resultProposed'
  | 'resultConfirmed'
  | 'finished'
  | 'undoRequested'
  | 'undo'
  | 'undoRejected'
  | 'scorekeeperReassigned'
  | 'abandonApproved'
  | 'abandoned'
  | 'seatVerified'
  | 'unknown'

export type EventTone = 'neutral' | 'success' | 'danger' | 'warning' | 'ghost'

/** Interpolation values; each key's message uses a subset. */
export interface EventValues {
  readonly actor?: string
  readonly from?: string
  readonly to?: string
  readonly round?: string
  readonly a?: string
  readonly b?: string
  readonly team?: string
  readonly name?: string
  readonly type?: string
}

export interface EventDescription {
  readonly key: EventKey
  readonly values: EventValues
  readonly tone: EventTone
}

export interface EventContext {
  readonly seatName: (seat: number) => string | null
  /** Seated player or club member name for a user id. */
  readonly userName: (userId: string) => string | null
  /** Round number shown in the round list for a round id. */
  readonly roundNo: (roundId: string) => number | null
  readonly formatNumber: (n: number) => string
  readonly teamLabel: (team: Team) => string
  /** Fallback when the actor can't be named (e.g. a removed member). */
  readonly someone: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const field = (payload: unknown, key: string): unknown => (isRecord(payload) ? payload[key] : undefined)
const strField = (payload: unknown, key: string): string | null => {
  const v = field(payload, key)
  return typeof v === 'string' && v.length > 0 ? v : null
}
const numField = (payload: unknown, key: string): number | null => {
  const v = field(payload, key)
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const teamField = (payload: unknown, key: string): Team | null => {
  const v = field(payload, key)
  return v === 'A' || v === 'B' ? v : null
}

export function actorName(row: EventRow, ctx: EventContext): string {
  const bySeat = row.actor_seat !== null ? ctx.seatName(row.actor_seat) : null
  const byUser = row.actor_id !== null ? ctx.userName(row.actor_id) : null
  return bySeat ?? byUser ?? ctx.someone
}

const SIMPLE: Readonly<Record<string, readonly [EventKey, EventTone]>> = {
  live: ['live', 'success'],
  invite_accepted: ['inviteAccepted', 'success'],
  invite_declined: ['inviteDeclined', 'warning'],
  switched_to_ghost: ['switchedToGhost', 'ghost'],
  cancelled: ['cancelled', 'danger'],
  expired: ['expired', 'warning'],
  result_confirmed: ['resultConfirmed', 'success'],
  undo_requested: ['undoRequested', 'warning'],
  undo_rejected: ['undoRejected', 'neutral'],
  abandon_approved: ['abandonApproved', 'warning'],
  abandoned: ['abandoned', 'danger'],
  seat_verified: ['seatVerified', 'ghost'],
}

const scoreValues = (row: EventRow, ctx: EventContext): Pick<EventValues, 'a' | 'b'> => ({
  a: ctx.formatNumber(numField(row.payload, 'a') ?? 0),
  b: ctx.formatNumber(numField(row.payload, 'b') ?? 0),
})

function roundLabel(row: EventRow, ctx: EventContext): string {
  const id = strField(row.payload, 'round_id')
  const n = (id ? ctx.roundNo(id) : null) ?? numField(row.payload, 'round_no')
  return n === null ? '—' : ctx.formatNumber(n)
}

function describeCreated(row: EventRow, actor: string): EventDescription {
  const mode = strField(row.payload, 'mode')
  if (mode === 'ghost') return { key: 'createdGhost', values: { actor }, tone: 'ghost' }
  if (mode === 'tournament') return { key: 'createdTournament', values: {}, tone: 'neutral' }
  return { key: 'created', values: { actor }, tone: 'neutral' }
}

function describePayloadEvent(row: EventRow, ctx: EventContext, actor: string): EventDescription | null {
  const winner = teamField(row.payload, 'winner')
  switch (row.type) {
    case 'created':
      return describeCreated(row, actor)
    case 'seat_swapped': {
      const from = strField(row.payload, 'from')
      const to = strField(row.payload, 'to')
      return {
        key: 'seatSwapped',
        values: { from: (from && ctx.userName(from)) || ctx.someone, to: (to && ctx.userName(to)) || ctx.someone },
        tone: 'neutral',
      }
    }
    case 'round_disputed':
      return { key: 'roundDisputed', values: { actor, round: roundLabel(row, ctx), ...scoreValues(row, ctx) }, tone: 'danger' }
    case 'round_edited':
      return {
        key: 'roundEdited',
        values: {
          actor,
          round: roundLabel(row, ctx),
          a: ctx.formatNumber(numField(row.payload, 'new_a') ?? 0),
          b: ctx.formatNumber(numField(row.payload, 'new_b') ?? 0),
        },
        tone: 'warning',
      }
    case 'undo':
      return { key: 'undo', values: { actor, round: roundLabel(row, ctx), ...scoreValues(row, ctx) }, tone: 'warning' }
    case 'result_proposed':
      return { key: 'resultProposed', values: { team: winner ? ctx.teamLabel(winner) : '—', ...scoreValues(row, ctx) }, tone: 'neutral' }
    case 'finished':
      return { key: 'finished', values: { team: winner ? ctx.teamLabel(winner) : '—' }, tone: 'success' }
    case 'scorekeeper_reassigned': {
      const seat = numField(row.payload, 'seat')
      return { key: 'scorekeeperReassigned', values: { name: (seat !== null && ctx.seatName(seat)) || ctx.someone }, tone: 'neutral' }
    }
    default:
      return null
  }
}

export function describeEvent(row: EventRow, ctx: EventContext): EventDescription {
  const actor = actorName(row, ctx)
  const simple = SIMPLE[row.type]
  if (simple) return { key: simple[0], values: { actor }, tone: simple[1] }
  return describePayloadEvent(row, ctx, actor) ?? { key: 'unknown', values: { type: row.type }, tone: 'neutral' }
}
