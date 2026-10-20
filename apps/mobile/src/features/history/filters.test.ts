import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  filtersToParams,
  nextPage,
  pageRange,
  parseFilters,
  rangeStart,
  toQueryParams,
} from './filters'

const NOW = new Date('2026-10-19T12:00:00.000Z')

describe('parseFilters', () => {
  it('returns defaults for empty params', () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS)
  })

  it('reads flags, player and range', () => {
    expect(parseFilters({ mine: '1', player: 'u2', range: '30d', verified: '1', tournament: '1' })).toEqual({
      mine: true,
      player: 'u2',
      range: '30d',
      verified: true,
      tournament: true,
    })
  })

  it('ignores unknown ranges, empty players and non-"1" flags', () => {
    expect(parseFilters({ mine: 'true', player: '', range: 'decade' })).toEqual(DEFAULT_FILTERS)
  })

  it('takes the first value of repeated params', () => {
    expect(parseFilters({ player: ['u3', 'u4'], range: ['7d', '30d'] })).toMatchObject({ player: 'u3', range: '7d' })
  })
})

describe('filtersToParams', () => {
  it('removes default values', () => {
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({
      mine: undefined,
      player: undefined,
      range: undefined,
      verified: undefined,
      tournament: undefined,
    })
  })

  it('round-trips through parseFilters', () => {
    const f = { mine: true, player: 'u9', range: 'season', verified: false, tournament: true } as const
    expect(parseFilters(filtersToParams(f))).toEqual(f)
  })
})

describe('activeFilterCount', () => {
  it('counts each non-default filter', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, mine: true, range: '7d', tournament: true })).toBe(3)
  })
})

describe('rangeStart', () => {
  it('returns null for all time', () => {
    expect(rangeStart('all', NOW, '2026-09-01')).toBeNull()
  })

  it('subtracts 7 and 30 days', () => {
    expect(rangeStart('7d', NOW, null)).toBe('2026-10-12T12:00:00.000Z')
    expect(rangeStart('30d', NOW, null)).toBe('2026-09-19T12:00:00.000Z')
  })

  it('uses the season start, or no bound when none is set', () => {
    expect(rangeStart('season', NOW, '2026-09-01')).toBe('2026-09-01')
    expect(rangeStart('season', NOW, null)).toBeNull()
  })
})

describe('toQueryParams', () => {
  it('maps defaults to an unconstrained query', () => {
    expect(toQueryParams(DEFAULT_FILTERS, 'me', NOW, null)).toEqual({
      playerIds: [],
      since: null,
      verifiedOnly: false,
      tournamentOnly: false,
    })
  })

  it('combines my games and a chosen player', () => {
    expect(toQueryParams({ ...DEFAULT_FILTERS, mine: true, player: 'u2' }, 'me', NOW, null).playerIds).toEqual(['me', 'u2'])
  })

  it('does not repeat me when I pick myself', () => {
    expect(toQueryParams({ ...DEFAULT_FILTERS, mine: true, player: 'me' }, 'me', NOW, null).playerIds).toEqual(['me'])
  })

  it('passes verified, tournament and date bounds', () => {
    const q = toQueryParams({ ...DEFAULT_FILTERS, verified: true, tournament: true, range: '7d' }, 'me', NOW, null)
    expect(q).toMatchObject({ verifiedOnly: true, tournamentOnly: true, since: '2026-10-12T12:00:00.000Z' })
  })
})

describe('pagination', () => {
  it('computes inclusive ranges of 30', () => {
    expect(PAGE_SIZE).toBe(30)
    expect(pageRange(0)).toEqual([0, 29])
    expect(pageRange(2)).toEqual([60, 89])
  })

  it('stops after a short page', () => {
    expect(nextPage(30, 1)).toBe(1)
    expect(nextPage(12, 3)).toBeUndefined()
    expect(nextPage(0, 1)).toBeUndefined()
  })
})
