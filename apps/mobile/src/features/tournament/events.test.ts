import { describe, expect, it } from 'vitest'
import { logItems } from './events'
import { match } from './testFixtures'
import type { EventRow } from './types'

const UID = '11111111-2222-3333-4444-555555555555'
const names: Record<string, string> = { [UID]: 'Omar', u2: 'Sara', org: 'Nour' }
const ctx = { nameOfUser: (id: string) => names[id] ?? '', matches: [match(2, 3, ['a', 'b'], ['c', 'd'], { matchId: 'm9' })] }

const ev = (id: string, type: string, payload: EventRow['payload'] = {}, at = '2026-10-19T18:00:00Z'): EventRow => ({
  id,
  type,
  actorId: 'org',
  payload,
  createdAt: at,
})

describe('logItems', () => {
  it('orders newest first and names the actor', () => {
    const items = logItems([ev('1', 'created', {}, '2026-10-19T18:00:00Z'), ev('2', 'started', {}, '2026-10-19T19:00:00Z')], ctx)
    expect(items.map((i) => [i.id, i.actor, i.detail.type])).toEqual([
      ['2', 'Nour', 'started'],
      ['1', 'Nour', 'created'],
    ])
  })

  it('parses counts, rounds and unknown types', () => {
    const items = logItems(
      [
        ev('1', 'entries_set', { count: 12 }),
        ev('2', 'round_started', { round_no: 3, tables: 3 }),
        ev('3', 'mystery', []),
        { ...ev('4', 'finished'), actorId: null },
      ],
      ctx,
    )
    expect(items.map((i) => i.detail)).toEqual([
      { type: 'entries_set', count: 12 },
      { type: 'round_started', roundNo: 3, tables: 3 },
      { type: 'other', raw: 'mystery' },
      { type: 'finished' },
    ])
    expect(items[3]!.actor).toBe('')
  })

  it('resolves substitutions from a member or a ghost seat', () => {
    const [a, b] = logItems([ev('1', 'substituted', { from: UID, to: 'u2' }), ev('2', 'substituted', { from: 'Ghost', to: 'u2' })], ctx)
    expect(a!.detail).toEqual({ type: 'substituted', from: 'Omar', to: 'Sara' })
    expect(b!.detail).toEqual({ type: 'substituted', from: 'Ghost', to: 'Sara' })
  })

  it('describes a result edit with its table, reason and before/after', () => {
    const [item] = logItems(
      [
        ev('1', 'result_edited', {
          match_id: 'm9',
          reason: 'phone died',
          from: { result: null, a: null, b: null },
          to: { result: 'b', a: 100, b: 900 },
        }),
      ],
      ctx,
    )
    expect(item!.detail).toEqual({
      type: 'result_edited',
      reason: 'phone died',
      roundNo: 2,
      tableNo: 3,
      from: { result: null, a: null, b: null },
      to: { result: 'b', a: 100, b: 900 },
    })
  })

  it('tolerates malformed payloads', () => {
    const [item] = logItems([ev('1', 'result_edited', 'oops')], ctx)
    expect(item!.detail).toMatchObject({ reason: '', roundNo: null, from: { result: null, a: null, b: null } })
  })
})
