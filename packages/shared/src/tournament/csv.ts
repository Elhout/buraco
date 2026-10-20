import type { Standing } from './types'

const CRLF = '\r\n'
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export type CsvCell = string | number | null

export interface MatchCsvRow {
  readonly round: number
  readonly table: number
  readonly teamA: string
  readonly teamB: string
  readonly pointsA: number | null
  readonly pointsB: number | null
  readonly result: string | null
}

/**
 * Renders one cell. Numbers are written as-is (so -50 stays numeric); string cells that a spreadsheet
 * could read as a formula get a leading single quote, then RFC 4180 quoting is applied if needed.
 */
function cell(value: CsvCell): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const toCsv = (header: readonly string[], rows: readonly (readonly CsvCell[])[]): string =>
  [header, ...rows].map((r) => r.map(cell).join(',') + CRLF).join('')

export function standingsToCsv(standings: readonly Standing[], nameOf: (unit: string) => string): string {
  return toCsv(
    ['Rank', 'Name', 'Played', 'Wins', 'Draws', 'Losses', 'Match points', 'Differential', 'Points for', 'Points against'],
    standings.map((s) => [
      s.rank,
      nameOf(s.unit),
      s.played,
      s.wins,
      s.draws,
      s.losses,
      s.matchPoints,
      s.differential,
      s.pointsFor,
      s.pointsAgainst,
    ]),
  )
}

export function matchesToCsv(rows: readonly MatchCsvRow[]): string {
  return toCsv(
    ['Round', 'Table', 'Team A', 'Team B', 'Points A', 'Points B', 'Result'],
    rows.map((r) => [r.round, r.table, r.teamA, r.teamB, r.pointsA, r.pointsB, r.result]),
  )
}
