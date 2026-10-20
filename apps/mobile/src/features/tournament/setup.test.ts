import { describe, expect, it } from 'vitest'
import {
  type SetupDraft,
  addGhost,
  buildCreateArgs,
  buildEntries,
  emptyDraft,
  ghostsNeeded,
  isoDay,
  movePair,
  removeGhost,
  tapToPair,
  toggleMember,
  unpair,
  unpairedMembers,
  validateDraft,
} from './setup'

const base = (over: Partial<SetupDraft> = {}): SetupDraft => ({ ...emptyDraft('2026-10-19', 2000), name: 'Autumn Cup', ...over })
const pick = (draft: SetupDraft, ids: string[]): SetupDraft => ids.reduce(toggleMember, draft)
const pairUp = (draft: SetupDraft, a: string, b: string): SetupDraft => tapToPair(tapToPair(draft, null, a).draft, a, b).draft

describe('entrant picking and pairing', () => {
  it('pairs two members with two taps and releases a held member on a second tap', () => {
    const d = pick(base(), ['a', 'b', 'c'])
    const held = tapToPair(d, null, 'a')
    expect(held.pending).toBe('a')
    expect(tapToPair(d, 'a', 'a').pending).toBeNull()
    const paired = tapToPair(held.draft, 'a', 'b')
    expect(paired.draft.pairs).toEqual([['a', 'b']])
    expect(unpairedMembers(paired.draft)).toEqual(['c'])
  })

  it('ignores taps on paired or unselected members', () => {
    const d = pairUp(pick(base(), ['a', 'b', 'c']), 'a', 'b')
    expect(tapToPair(d, null, 'a')).toEqual({ draft: d, pending: null })
    expect(tapToPair(d, 'c', 'zz')).toEqual({ draft: d, pending: 'c' })
  })

  it('removing a member breaks their pair; unpair removes a pair', () => {
    const d = pairUp(pick(base(), ['a', 'b']), 'a', 'b')
    expect(toggleMember(d, 'a')).toMatchObject({ selected: ['b'], pairs: [] })
    expect(unpair(d, 0).pairs).toEqual([])
  })

  it('moves pairs to change knockout seeds and ignores out-of-range moves', () => {
    let d = pairUp(pairUp(pick(base(), ['a', 'b', 'c', 'd']), 'a', 'b'), 'c', 'd')
    d = movePair(d, 1, -1)
    expect(d.pairs).toEqual([
      ['c', 'd'],
      ['a', 'b'],
    ])
    expect(movePair(d, 0, -1)).toBe(d)
    expect(movePair(d, 1, 1)).toBe(d)
  })

  it('counts ghost seats needed to fill a table', () => {
    const d = pick(base({ pairing: 'rotating' }), ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(ghostsNeeded(d)).toBe(1)
    expect(ghostsNeeded(addGhost(d, 'Ghost 1'))).toBe(0)
    expect(removeGhost(addGhost(d, 'Ghost 1'), 0).ghosts).toEqual([])
  })
})

describe('validateDraft', () => {
  it('accepts four fixed pairs', () => {
    let d = pick(base(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    for (const [x, y] of [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ] as const)
      d = pairUp(d, x, y)
    expect(validateDraft(d)).toEqual({ errors: [], warnings: [] })
  })

  it('flags unpaired members and too few entrants', () => {
    expect(validateDraft(pick(base(), ['a', 'b'])).errors).toEqual(['tooFewEntrants'])
    expect(validateDraft(pairUp(pick(base(), ['a', 'b', 'c', 'd']), 'a', 'b')).errors).toEqual(['unpaired'])
  })

  it('needs a multiple of 4 in rotating mode; a ghost seat fixes it', () => {
    const d = pick(base({ pairing: 'rotating' }), ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(validateDraft(d).errors).toEqual(['notMultipleOfFour'])
    expect(validateDraft(addGhost(d, 'Ghost')).errors).toEqual([])
  })

  it('caps a tournament at 64 entrants', () => {
    const ids = Array.from({ length: 68 }, (_, i) => `m${i}`)
    expect(validateDraft(pick(base({ pairing: 'rotating' }), ids)).errors).toEqual(['tooManyEntrants'])
  })

  it('runs knockouts on fixed pairs only', () => {
    const d = pick(base({ pairing: 'rotating', format: 'knockout' }), ['a', 'b', 'c', 'd'])
    expect(validateDraft(d).errors).toEqual(['knockoutNeedsPairs'])
  })

  it('validates name, date, round length and target', () => {
    const d = pick(base({ name: ' ', startsOn: '2026-02-30', roundMinutes: '3', target: '0', pairing: 'rotating' }), ['a', 'b', 'c', 'd'])
    expect(validateDraft(d).errors).toEqual(['nameRequired', 'dateInvalid', 'minutesInvalid', 'targetInvalid'])
    expect(validateDraft({ ...d, name: 'x'.repeat(81), startsOn: '2026-10-19', roundMinutes: '45', target: 'abc' }).errors).toEqual([
      'nameTooLong',
      'targetInvalid',
    ])
  })

  it('warns about formats outside their sweet spot', () => {
    const ids = Array.from({ length: 14 }, (_, i) => `m${i}`)
    let d = pick(base({ format: 'round_robin' }), ids)
    for (let i = 0; i < ids.length; i += 2) d = pairUp(d, ids[i]!, ids[i + 1]!)
    expect(validateDraft(d).warnings).toEqual(['roundRobinLarge'])
    const small = pick(base({ pairing: 'rotating' }), ['a', 'b', 'c', 'd'])
    expect(validateDraft(small).warnings).toEqual(['swissSize'])
  })
})

describe('payloads', () => {
  it('builds fixed-pair entries with a shared pair key and seed', () => {
    const d = pairUp(pairUp(pick(base(), ['a', 'b', 'c', 'd']), 'c', 'd'), 'a', 'b')
    expect(buildEntries(d)).toEqual([
      { user_id: 'c', pair: 'p1', seed: 1 },
      { user_id: 'd', pair: 'p1', seed: 1 },
      { user_id: 'a', pair: 'p2', seed: 2 },
      { user_id: 'b', pair: 'p2', seed: 2 },
    ])
  })

  it('builds rotating entries with ghost seats last', () => {
    const d = addGhost(pick(base({ pairing: 'rotating' }), ['a', 'b', 'c']), 'Ghost 1')
    expect(buildEntries(d)).toEqual([
      { user_id: 'a', seed: 1 },
      { user_id: 'b', seed: 2 },
      { user_id: 'c', seed: 3 },
      { guest_name: 'Ghost 1', seed: 4 },
    ])
  })

  it('builds create_tournament arguments', () => {
    expect(buildCreateArgs(base({ name: '  Cup ', roundMinutes: '30', target: '1500' }), 'c1')).toEqual({
      p_club_id: 'c1',
      p_name: 'Cup',
      p_format: 'swiss',
      p_pairing: 'fixed',
      p_round_minutes: 30,
      p_target_score: 1500,
      p_starts_on: '2026-10-19',
    })
  })

  it('formats a local calendar day', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
