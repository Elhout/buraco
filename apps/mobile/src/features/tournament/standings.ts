import { type MatchCsvRow, type Standing, computeStandings, matchesToCsv, standingsToCsv } from '@buraco/shared'
import type { EntryView, MatchView, RoundRow } from './types'
import { PAIR_JOINER, type UnitIndex, allByes, toPlayedMatches, unitKeyOf } from './units'

/** Standings with display names, plus the CSV exports. Pure. */

export interface StandingRow extends Standing {
  readonly name: string
  readonly isMe: boolean
}

export interface StandingsInput {
  readonly index: UnitIndex
  readonly matches: readonly MatchView[]
  readonly rounds: readonly RoundRow[]
  readonly myUnit: string | null
}

export function standingRows({ index, matches, rounds, myUnit }: StandingsInput): StandingRow[] {
  const standings = computeStandings({ units: index.units, matches: toPlayedMatches(matches, index), byes: allByes(rounds) })
  return standings.map((s) => ({ ...s, name: index.nameOf(s.unit), isMe: s.unit === myUnit }))
}

export function myUnitOf(entries: readonly EntryView[], userId: string, pairing: 'fixed' | 'rotating'): string | null {
  const mine = entries.find((e) => e.userId === userId)
  return mine ? unitKeyOf(mine, pairing) : null
}

const RESULT_LABEL = { a: 'A', b: 'B', draw: 'Draw' } as const

/** Every match, oldest round first; unfinished matches export their live score with an empty result. */
export function matchCsvRows(matches: readonly MatchView[], index: UnitIndex): MatchCsvRow[] {
  return [...matches]
    .sort((a, b) => a.roundNo - b.roundNo || a.tableNo - b.tableNo)
    .map((m) => ({
      round: m.roundNo,
      table: m.tableNo,
      teamA: m.teamA.map(index.entryName).join(PAIR_JOINER),
      teamB: m.teamB.map(index.entryName).join(PAIR_JOINER),
      pointsA: m.result === null ? m.liveA : m.pointsA,
      pointsB: m.result === null ? m.liveB : m.pointsB,
      result: m.result === null ? null : RESULT_LABEL[m.result],
    }))
}

/** UTF-8 BOM so Excel opens Arabic names correctly. */
export const BOM = String.fromCharCode(0xfeff)

export const standingsCsv = (rows: readonly StandingRow[]): string =>
  BOM + standingsToCsv(rows, (unit) => rows.find((r) => r.unit === unit)?.name ?? '')

export const resultsCsv = (matches: readonly MatchView[], index: UnitIndex): string => BOM + matchesToCsv(matchCsvRows(matches, index))

/** A file-name-safe slug; falls back to "tournament" for names without Latin letters or digits. */
export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug === '' ? 'tournament' : slug
}
