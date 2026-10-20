import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, type OutboxItem, type Sender, flush, memoryStore, newSubmitRound, pendingForGame } from './core'

const item = (id: string, createdAt: number, gameId = 'g1'): OutboxItem =>
  newSubmitRound({ gameId, teamA: 100, teamB: 50, cutSeats: [], clientId: id }, createdAt)

describe('outbox flush', () => {
  it('sends everything oldest first and empties the store', async () => {
    const store = memoryStore([item('b', 2), item('a', 1)])
    const order: string[] = []
    const report = await flush(store, async (i) => {
      order.push(i.id)
      return { kind: 'done' }
    })
    expect(order).toEqual(['a', 'b'])
    expect(report.sent.map((i) => i.id)).toEqual(['a', 'b'])
    expect(await store.all()).toEqual([])
  })

  it('stops at a transient failure, keeping that item and everything after it', async () => {
    const store = memoryStore([item('a', 1), item('b', 2), item('c', 3)])
    const send: Sender = async (i) => (i.id === 'b' ? { kind: 'retry', error: 'offline' } : { kind: 'done' })
    const report = await flush(store, send)
    expect(report.sent.map((i) => i.id)).toEqual(['a'])
    expect(report.pending).toBe(2)
    const left = await store.all()
    expect(left.map((i) => i.id).sort()).toEqual(['b', 'c'])
    expect(left.find((i) => i.id === 'b')).toMatchObject({ attempts: 1, lastError: 'offline' })
  })

  it('drops an item the server refuses for good and carries on', async () => {
    const store = memoryStore([item('a', 1), item('b', 2)])
    const report = await flush(store, async (i) => (i.id === 'a' ? { kind: 'drop', error: 'roundPending' } : { kind: 'done' }))
    expect(report.dropped).toEqual([{ item: expect.objectContaining({ id: 'a' }), error: 'roundPending' }])
    expect(report.sent.map((i) => i.id)).toEqual(['b'])
    expect(await store.all()).toEqual([])
  })

  it('gives up after MAX_ATTEMPTS transient failures', async () => {
    const store = memoryStore([{ ...item('a', 1), attempts: MAX_ATTEMPTS - 1 }])
    const report = await flush(store, async () => ({ kind: 'retry', error: 'still offline' }))
    expect(report.dropped).toHaveLength(1)
    expect(await store.all()).toEqual([])
  })

  it('does nothing on an empty outbox', async () => {
    expect(await flush(memoryStore(), async () => ({ kind: 'done' }))).toEqual({ sent: [], dropped: [], pending: 0 })
  })

  it('uses the idempotency key as the item id', () => {
    expect(item('client-123', 1).id).toBe('client-123')
  })
})

describe('pendingForGame', () => {
  it('filters by game', () => {
    const items = [item('a', 1, 'g1'), item('b', 2, 'g2')]
    expect(pendingForGame(items, 'g2').map((i) => i.id)).toEqual(['b'])
  })
})
