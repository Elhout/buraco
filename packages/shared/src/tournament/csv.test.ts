import { describe, expect, it } from 'vitest'
import { matchesToCsv, standingsToCsv } from './csv'
import type { Standing } from './types'

const standing = (unit: string, rank: number): Standing => ({
  unit,
  rank,
  played: 3,
  wins: 2,
  draws: 0,
  losses: 1,
  matchPoints: 4,
  differential: -50,
  pointsFor: 4500,
  pointsAgainst: 4550,
})

const row = (over: Partial<Parameters<typeof matchesToCsv>[0][number]> = {}): Parameters<typeof matchesToCsv>[0][number] => ({
  round: 1,
  table: 2,
  teamA: 'Ann & Bo',
  teamB: 'Cy & Di',
  pointsA: 2000,
  pointsB: 1500,
  result: 'a',
  ...over,
})

describe('standingsToCsv', () => {
  it('writes a header, CRLF line ends and one line per standing', () => {
    const csv = standingsToCsv([standing('u1', 1), standing('u2', 2)], (u) => `Name ${u}`)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Rank,Name,Played,Wins,Draws,Losses,Match points,Differential,Points for,Points against')
    expect(lines[1]).toBe('1,Name u1,3,2,0,1,4,-50,4500,4550')
    expect(lines[2]).toBe('2,Name u2,3,2,0,1,4,-50,4500,4550')
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).not.toMatch(/(?<!\r)\n/)
  })

  it('keeps negative numeric values unprefixed', () => {
    expect(standingsToCsv([standing('u', 1)], () => 'x')).toContain(',-50,')
  })

  it('returns only the header when there are no standings', () => {
    expect(standingsToCsv([], () => '')).toBe('Rank,Name,Played,Wins,Draws,Losses,Match points,Differential,Points for,Points against\r\n')
  })

  it('quotes names containing commas, quotes and newlines (RFC 4180)', () => {
    const names: Record<string, string> = { a: 'Smith, Ann', b: 'Bo "The Cut"', c: 'Line\nBreak', d: 'Car\rRet' }
    const csv = standingsToCsv(
      ['a', 'b', 'c', 'd'].map((u, i) => standing(u, i + 1)),
      (u) => names[u] as string,
    )
    expect(csv).toContain('1,"Smith, Ann",')
    expect(csv).toContain('2,"Bo ""The Cut""",')
    expect(csv).toContain('3,"Line\nBreak",')
    expect(csv).toContain('4,"Car\rRet",')
  })

  it('prefixes formula-like names with a single quote', () => {
    const csv = standingsToCsv([standing('a', 1)], () => '=HYPERLINK("http://x")')
    expect(csv).toContain(`1,"'=HYPERLINK(""http://x"")",`)
  })
})

describe('matchesToCsv', () => {
  it('writes a header and rows, using empty cells for null values', () => {
    const csv = matchesToCsv([row(), row({ round: 2, pointsA: null, pointsB: null, result: null })])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Round,Table,Team A,Team B,Points A,Points B,Result')
    expect(lines[1]).toBe('1,2,Ann & Bo,Cy & Di,2000,1500,a')
    expect(lines[2]).toBe('2,2,Ann & Bo,Cy & Di,,,')
    expect(lines[3]).toBe('')
  })

  it('returns only the header for no rows', () => {
    expect(matchesToCsv([])).toBe('Round,Table,Team A,Team B,Points A,Points B,Result\r\n')
  })

  it('writes negative point values as plain numbers', () => {
    expect(matchesToCsv([row({ pointsA: -50 })])).toContain(',-50,1500,')
  })

  it.each(['=1+1', '+SUM(A1)', '-cmd', '@SUM(A1)', '\tTab'])('guards string cell %j against formula injection', (cell) => {
    const csv = matchesToCsv([row({ teamA: cell })])
    expect(csv).toContain(`,'${cell},`)
  })

  it('does not prefix safe strings and quotes combined cases', () => {
    const csv = matchesToCsv([row({ teamA: 'A, B', teamB: 'x=y' })])
    expect(csv).toContain(',"A, B",x=y,')
  })
})
