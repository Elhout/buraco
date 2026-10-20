import type { Json } from '@buraco/shared'
import type { EventRow, MatchResultValue, MatchView } from './types'

/** tournament_events → typed log items. Payloads are untrusted JSON, so every field is narrowed. */

export interface ResultSnapshot {
  readonly result: MatchResultValue | null
  readonly a: number | null
  readonly b: number | null
}

export type LogDetail =
  | { readonly type: 'created' | 'started' | 'finished' | 'cancelled' }
  | { readonly type: 'entries_set'; readonly count: number }
  | { readonly type: 'round_started'; readonly roundNo: number; readonly tables: number }
  | { readonly type: 'substituted'; readonly from: string; readonly to: string }
  | {
      readonly type: 'result_edited'
      readonly reason: string
      readonly roundNo: number | null
      readonly tableNo: number | null
      readonly from: ResultSnapshot
      readonly to: ResultSnapshot
    }
  | { readonly type: 'other'; readonly raw: string }

export interface LogItem {
  readonly id: string
  readonly at: string
  readonly actor: string
  readonly detail: LogDetail
}

type JsonObject = { readonly [key: string]: Json | undefined }

const obj = (v: Json | undefined): JsonObject => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {})
const num = (v: Json | undefined): number | null => (typeof v === 'number' ? v : null)
const str = (v: Json | undefined): string => (typeof v === 'string' ? v : '')
const result = (v: Json | undefined): MatchResultValue | null => (v === 'a' || v === 'b' || v === 'draw' ? v : null)

const snapshot = (v: Json | undefined): ResultSnapshot => {
  const o = obj(v)
  return { result: result(o.result), a: num(o.a), b: num(o.b) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LogContext {
  readonly nameOfUser: (userId: string) => string
  readonly matches: readonly MatchView[]
}

function detailOf(row: EventRow, ctx: LogContext): LogDetail {
  const p = obj(row.payload)
  switch (row.type) {
    case 'created':
    case 'started':
    case 'finished':
    case 'cancelled':
      return { type: row.type }
    case 'entries_set':
      return { type: 'entries_set', count: num(p.count) ?? 0 }
    case 'round_started':
      return { type: 'round_started', roundNo: num(p.round_no) ?? 0, tables: num(p.tables) ?? 0 }
    case 'substituted': {
      // "from" is the previous member id, or a ghost seat's guest name.
      const from = str(p.from)
      return { type: 'substituted', from: UUID.test(from) ? ctx.nameOfUser(from) : from, to: ctx.nameOfUser(str(p.to)) }
    }
    case 'result_edited': {
      const match = ctx.matches.find((m) => m.matchId === str(p.match_id))
      return {
        type: 'result_edited',
        reason: str(p.reason),
        roundNo: match?.roundNo ?? null,
        tableNo: match?.tableNo ?? null,
        from: snapshot(p.from),
        to: snapshot(p.to),
      }
    }
    default:
      return { type: 'other', raw: row.type }
  }
}

/** Newest first. */
export function logItems(rows: readonly EventRow[], ctx: LogContext): LogItem[] {
  return [...rows]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((row) => ({ id: row.id, at: row.createdAt, actor: row.actorId ? ctx.nameOfUser(row.actorId) : '', detail: detailOf(row, ctx) }))
}
