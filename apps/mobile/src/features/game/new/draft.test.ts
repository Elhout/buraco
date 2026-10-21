import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  type Player,
  type Slots,
  clearSeat,
  filledCount,
  guestFrom,
  nextFreeSeat,
  samePlayer,
  seatOf,
  shuffle,
  swapTeams,
  teamOfSeat,
  toSeats,
  togglePlayer,
  validateDraft,
  withoutGuests,
  nextGuest,
  placeInSeat,
} from './draft'

const m = (id: string): Player => ({ kind: 'member', userId: id, name: id.toUpperCase() })
const g = (name: string): Player => ({ kind: 'guest', name })
const HOST = 'host'
const full: Slots = [m(HOST), m('b'), m('c'), m('d')]

describe('placing players', () => {
  it('fills my team first: seats 1, 3, then 2, 4', () => {
    let s = EMPTY
    for (const id of [HOST, 'p', 'o1', 'o2']) s = togglePlayer(s, m(id))
    expect(s.map((p) => (p?.kind === 'member' ? p.userId : null))).toEqual([HOST, 'o1', 'p', 'o2'])
    expect(nextFreeSeat(s)).toBeNull()
  })

  it('ignores taps when the table is full', () => {
    expect(togglePlayer(full, m('x'))).toBe(full)
  })

  it('removes a seated player when tapped again', () => {
    const s = togglePlayer(full, m('c'))
    expect(s[2]).toBeNull()
    expect(filledCount(s)).toBe(3)
    expect(nextFreeSeat(s)).toBe(3)
  })

  it('clears a seat', () => {
    expect(clearSeat(full, 2)[1]).toBeNull()
  })

  it('maps seats to teams', () => {
    expect([1, 2, 3, 4].map((s) => teamOfSeat(s as 1 | 2 | 3 | 4))).toEqual(['A', 'B', 'A', 'B'])
  })

  it('matches guests by name, case-insensitively', () => {
    expect(samePlayer(g('Ali'), g(' ali '))).toBe(true)
    expect(samePlayer(g('Ali'), m('ali'))).toBe(false)
    expect(seatOf([g('Ali'), null, null, null], g('ALI'))).toBe(1)
  })
})

describe('rearranging', () => {
  it('swaps teams keeping partners together', () => {
    const s = swapTeams(full)
    expect(s).toEqual([m('b'), m(HOST), m('d'), m('c')])
  })

  it('shuffles deterministically with an injected random', () => {
    expect(shuffle(full, () => 0)).toEqual([m('b'), m('c'), m('d'), m(HOST)])
    const s = shuffle(full, () => 0.999)
    expect(s).toEqual(full)
  })

  it('drops guests when leaving ghost mode', () => {
    expect(withoutGuests([m(HOST), g('Ali'), null, m('d')])).toEqual([m(HOST), null, null, m('d')])
  })
})

describe('validateDraft', () => {
  it('accepts four members with the host seated', () => {
    expect(validateDraft(full, 'normal', HOST)).toEqual([])
  })

  it('needs four players', () => {
    expect(validateDraft([m(HOST), null, m('c'), m('d')], 'normal', HOST)).toEqual(['needFour'])
  })

  it('rejects duplicates', () => {
    expect(validateDraft([m(HOST), m('b'), m('b'), m('d')], 'normal', HOST)).toContain('duplicate')
    expect(validateDraft([m(HOST), g('Ali'), g('ali'), m('d')], 'ghost', HOST)).toContain('duplicate')
  })

  it('allows guests only in ghost mode', () => {
    const slots: Slots = [m(HOST), g('Ali'), m('c'), m('d')]
    expect(validateDraft(slots, 'normal', HOST)).toContain('guestsNeedGhost')
    expect(validateDraft(slots, 'ghost', HOST)).toEqual([])
  })

  it('requires the host to play in normal mode only', () => {
    const slots: Slots = [m('a'), m('b'), m('c'), m('d')]
    expect(validateDraft(slots, 'normal', HOST)).toEqual(['hostMustPlay'])
    expect(validateDraft(slots, 'ghost', HOST)).toEqual([])
  })

  it('rejects blank or overlong guest names', () => {
    expect(validateDraft([m(HOST), g('  '), m('c'), m('d')], 'ghost', HOST)).toContain('guestName')
    expect(validateDraft([m(HOST), g('x'.repeat(41)), m('c'), m('d')], 'ghost', HOST)).toContain('guestName')
  })
})

describe('toSeats', () => {
  it('builds create_game seats with teams by seat number', () => {
    expect(toSeats([m(HOST), g(' Ali '), m('c'), m('d')])).toEqual([
      { seat: 1, team: 'A', userId: HOST },
      { seat: 2, team: 'B', guestName: 'Ali' },
      { seat: 3, team: 'A', userId: 'c' },
      { seat: 4, team: 'B', userId: 'd' },
    ])
  })

  it('skips empty seats', () => {
    expect(toSeats([null, null, m('c'), null])).toEqual([{ seat: 3, team: 'A', userId: 'c' }])
  })
})

describe('guestFrom', () => {
  it('normalises whitespace', () => {
    expect(guestFrom('  Umm   Ali ', EMPTY)).toEqual(g('Umm Ali'))
  })

  it('rejects empty, overlong and duplicate names', () => {
    expect(guestFrom('   ', EMPTY)).toBeNull()
    expect(guestFrom('x'.repeat(41), EMPTY)).toBeNull()
    expect(guestFrom('ali', [g('Ali'), null, null, null])).toBeNull()
  })
})

describe('placeInSeat', () => {
  const sam = { kind: 'member' as const, userId: 'sam', name: 'Samy' }
  const ak = { kind: 'member' as const, userId: 'ak', name: 'AK' }

  it('puts a player in the chosen seat', () => {
    expect(placeInSeat(EMPTY, 2, sam)).toEqual([null, sam, null, null])
  })

  it('moves a player who already sits elsewhere instead of seating them twice', () => {
    expect(placeInSeat([sam, ak, null, null], 4, sam)).toEqual([null, ak, null, sam])
  })

  it('replaces whoever was in that seat', () => {
    expect(placeInSeat([sam, null, null, null], 1, ak)).toEqual([ak, null, null, null])
  })
})

describe('nextGuest', () => {
  it('numbers guests from 1 and fills gaps', () => {
    expect(nextGuest(EMPTY, 'Guest')).toEqual({ kind: 'guest', name: 'Guest 1' })
    const g1 = { kind: 'guest' as const, name: 'Guest 1' }
    const g3 = { kind: 'guest' as const, name: 'Guest 3' }
    expect(nextGuest([g1, null, null, null], 'Guest')).toEqual({ kind: 'guest', name: 'Guest 2' })
    expect(nextGuest([g1, g3, null, null], 'Guest').name).toBe('Guest 2')
  })

  it('uses the label it is given (Arabic too)', () => {
    expect(nextGuest(EMPTY, 'ضيف').name).toBe('ضيف 1')
  })
})
