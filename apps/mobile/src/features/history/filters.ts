/**
 * History filters live in the URL (search params), so a filtered list survives navigation and
 * can be deep-linked. Pure: no React Native imports (tested with Vitest).
 */

export const DATE_RANGES = ['all', '7d', '30d', 'season'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export interface HistoryFilters {
  readonly mine: boolean
  readonly player: string | null
  readonly range: DateRange
  readonly verified: boolean
  readonly tournament: boolean
}

export const DEFAULT_FILTERS: HistoryFilters = { mine: false, player: null, range: 'all', verified: false, tournament: false }

/** Raw search params as expo-router hands them over (a param may repeat, hence string[]). */
export type RawParams = Readonly<Record<string, string | string[] | undefined>>

/** Search params to set; undefined removes the param. */
export type FilterParams = Record<'mine' | 'player' | 'range' | 'verified' | 'tournament', string | undefined>

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)
const flag = (v: string | string[] | undefined): boolean => first(v) === '1'
const isRange = (v: string | undefined): v is DateRange => DATE_RANGES.some((r) => r === v)

export function parseFilters(params: RawParams): HistoryFilters {
  const range = first(params.range)
  const player = first(params.player)
  return {
    mine: flag(params.mine),
    player: player && player.length > 0 ? player : null,
    range: isRange(range) ? range : 'all',
    verified: flag(params.verified),
    tournament: flag(params.tournament),
  }
}

export function filtersToParams(f: HistoryFilters): FilterParams {
  return {
    mine: f.mine ? '1' : undefined,
    player: f.player ?? undefined,
    range: f.range === 'all' ? undefined : f.range,
    verified: f.verified ? '1' : undefined,
    tournament: f.tournament ? '1' : undefined,
  }
}

export const activeFilterCount = (f: HistoryFilters): number =>
  [f.mine, f.player !== null, f.range !== 'all', f.verified, f.tournament].filter(Boolean).length

const DAY_MS = 86_400_000

/**
 * Lower bound for finished_at, or null for "no bound". "This season" without a season start
 * set by the organizer means all time.
 */
export function rangeStart(range: DateRange, now: Date, seasonStart: string | null): string | null {
  switch (range) {
    case '7d':
      return new Date(now.getTime() - 7 * DAY_MS).toISOString()
    case '30d':
      return new Date(now.getTime() - 30 * DAY_MS).toISOString()
    case 'season':
      return seasonStart
    default:
      return null
  }
}

export interface HistoryQueryParams {
  /** Every id must be in player_ids (`.contains('player_ids', ids)`); empty means no constraint. */
  readonly playerIds: readonly string[]
  readonly since: string | null
  readonly verifiedOnly: boolean
  readonly tournamentOnly: boolean
}

export function toQueryParams(f: HistoryFilters, me: string, now: Date, seasonStart: string | null): HistoryQueryParams {
  const ids = new Set<string>()
  if (f.mine) ids.add(me)
  if (f.player) ids.add(f.player)
  return {
    playerIds: [...ids],
    since: rangeStart(f.range, now, seasonStart),
    verifiedOnly: f.verified,
    tournamentOnly: f.tournament,
  }
}

export const PAGE_SIZE = 30

/** Index range (inclusive) for page n, as PostgREST's .range() wants it. */
export const pageRange = (page: number): readonly [number, number] => [page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1]

/** Next page index, or undefined once a short page says there is nothing more. */
export const nextPage = (lastPageLength: number, pagesLoaded: number): number | undefined =>
  lastPageLength < PAGE_SIZE ? undefined : pagesLoaded
