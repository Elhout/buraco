import { describe, expect, it } from 'vitest'
import { BOM, fileSlug, matchCsvRows, myUnitOf, resultsCsv, standingRows, standingsCsv } from './standings'
import { entry, match, pairs, players, round } from './testFixtures'
import { buildUnitIndex } from './units'

const named = pairs(2).map((e, i) => ({ ...e, name: ['Omar', 'Sara', 'Ahmed', 'Nour'][i]! }))
const index = buildUnitIndex(named, 'fixed')

describe('standingRows', () => {
  it('ranks pairs with display names and highlights mine', () => {
    const matches = [match(1, 1, ['e1', 'e2'], ['e3', 'e4'], { result: 'b', pointsA: 300, pointsB: 1600 })]
    const rows = standingRows({ index, matches, rounds: [round(1)], myUnit: 'p1' })
    expect(rows.map((r) => [r.rank, r.name, r.matchPoints, r.differential, r.isMe])).toEqual([
      [1, 'Ahmed & Nour', 2, 1000, false],
      [2, 'Omar & Sara', 0, -1000, true],
    ])
  })

  it('scores byes as wins', () => {
    const idx = buildUnitIndex(pairs(3), 'fixed')
    const rows = standingRows({ index: idx, matches: [], rounds: [round(1, { byes: ['p3'] })], myUnit: null })
    expect(rows[0]).toMatchObject({ unit: 'p3', wins: 1, played: 1 })
  })

  it('finds my unit: pair id in fixed mode, entry id in rotating mode', () => {
    expect(myUnitOf(named, 'u-e2', 'fixed')).toBe('p1')
    expect(myUnitOf(players(4), 'u-e2', 'rotating')).toBe('e2')
    expect(myUnitOf(named, 'nobody', 'fixed')).toBeNull()
  })
})

describe('CSV export', () => {
  it('writes match rows oldest first with live scores for unfinished tables', () => {
    const matches = [
      match(2, 1, ['e1', 'e2'], ['e3', 'e4'], { liveA: 250, liveB: 90 }),
      match(1, 1, ['e1', 'e2'], ['e3', 'e4'], { result: 'draw', pointsA: 700, pointsB: 700 }),
    ]
    expect(matchCsvRows(matches, index)).toEqual([
      { round: 1, table: 1, teamA: 'Omar & Sara', teamB: 'Ahmed & Nour', pointsA: 700, pointsB: 700, result: 'Draw' },
      { round: 2, table: 1, teamA: 'Omar & Sara', teamB: 'Ahmed & Nour', pointsA: 250, pointsB: 90, result: null },
    ])
  })

  it('prefixes a BOM so Excel reads Arabic', () => {
    const arabic = buildUnitIndex([entry('x', { name: 'عمر', seed: 1 }), entry('y', { name: 'سارة', seed: 2 })], 'rotating')
    const rows = standingRows({ index: arabic, matches: [], rounds: [], myUnit: null })
    const csv = standingsCsv(rows)
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toContain('عمر')
    expect(resultsCsv([], arabic)).toBe(`${BOM}Round,Table,Team A,Team B,Points A,Points B,Result\r\n`)
  })

  it('makes a safe file slug', () => {
    expect(fileSlug('Autumn Cup 2026!')).toBe('autumn-cup-2026')
    expect(fileSlug('كأس الخريف')).toBe('tournament')
  })
})
