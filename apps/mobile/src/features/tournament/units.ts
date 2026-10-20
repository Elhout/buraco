import type { PlayedMatch } from '@buraco/shared'
import type { EntryView, MatchView, RoundRow, TournamentPairing } from './types'

/**
 * Entries → ranked units. Fixed pairs: a unit is the pair_id (both entries share it).
 * Rotating partners: a unit is the entry id. Units are ordered by seed, then id, so every
 * phone derives the same order (round-robin schedules depend on it).
 */
export interface UnitIndex {
  readonly units: readonly string[]
  readonly entriesOf: (unit: string) => readonly string[]
  readonly unitOf: (entryId: string) => string
  readonly nameOf: (unit: string) => string
  readonly entryName: (entryId: string) => string
}

export const PAIR_JOINER = ' & '

const bySeedThenId = (a: EntryView, b: EntryView): number => {
  const sa = a.seed ?? Number.POSITIVE_INFINITY
  const sb = b.seed ?? Number.POSITIVE_INFINITY
  if (sa !== sb) return sa < sb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export const unitKeyOf = (entry: EntryView, pairing: TournamentPairing): string =>
  pairing === 'fixed' && entry.pairId !== null ? entry.pairId : entry.id

export function buildUnitIndex(entries: readonly EntryView[], pairing: TournamentPairing): UnitIndex {
  const sorted = [...entries].sort(bySeedThenId)
  const members = new Map<string, EntryView[]>()
  for (const e of sorted) {
    const key = unitKeyOf(e, pairing)
    members.set(key, [...(members.get(key) ?? []), e])
  }
  const unitByEntry = new Map(sorted.map((e) => [e.id, unitKeyOf(e, pairing)]))
  const nameByEntry = new Map(sorted.map((e) => [e.id, e.name]))
  return {
    units: [...members.keys()],
    entriesOf: (unit) => (members.get(unit) ?? []).map((e) => e.id),
    unitOf: (entryId) => unitByEntry.get(entryId) ?? entryId,
    nameOf: (unit) =>
      (members.get(unit) ?? [])
        .map((e) => e.name)
        .filter((n) => n !== '')
        .join(PAIR_JOINER),
    entryName: (entryId) => nameByEntry.get(entryId) ?? '',
  }
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)]

/** DB match rows → engine matches (sides expressed in units). */
export function toPlayedMatches(matches: readonly MatchView[], index: UnitIndex): PlayedMatch[] {
  return matches.map((m) => ({
    teamA: uniq(m.teamA.map(index.unitOf)),
    teamB: uniq(m.teamB.map(index.unitOf)),
    result: m.result,
    pointsA: m.pointsA ?? 0,
    pointsB: m.pointsB ?? 0,
  }))
}

/** Every bye awarded so far, one entry per bye (a unit may repeat), in round order. */
export const allByes = (rounds: readonly RoundRow[]): string[] => [...rounds].sort((a, b) => a.round_no - b.round_no).flatMap((r) => r.byes)

/** "Omar and Sara" / "Omar" — names joined for sentences. */
export function joinNames(names: readonly string[], and: string): string {
  const clean = names.filter((n) => n !== '')
  if (clean.length <= 1) return clean[0] ?? ''
  return `${clean.slice(0, -1).join(', ')} ${and} ${clean[clean.length - 1]}`
}
