import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Over', 1)
}, 120_000)

const finishedPushes = async (tx: Transaction, gameId: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{ user_id: string; deep_link: string; payload: Record<string, unknown> }>(
    `select user_id, deep_link, payload from public.notification_queue where game_id = $1 and event = 'game_finished'`,
    [gameId],
  )
  return rows
}

const startNow = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[0])
  return rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
}

describe('game over push (whole club)', () => {
  it('tells every club member the result when a game ends', async () => {
    await inTx(db, async (tx) => {
      const id = await startNow(tx)
      await rpc(tx, 'public.submit_round($1, 2100, 300)', [id])
      expect(await finishedPushes(tx, id)).toHaveLength(0)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.confirm_result($1)', [id])
      const rows = await finishedPushes(tx, id)
      expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([...club.players, ...club.others]))
      expect(rows).toHaveLength(5)
      expect(rows[0]).toMatchObject({
        deep_link: `/game/${id}`,
        payload: { winner: 'A', a: 2100, b: 300, team_a: ['Over-Omar', 'Over-Sara'], team_b: ['Over-Ahmed', 'Over-Nour'] },
      })
    })
  })

  it('honours the club-games notification switch', async () => {
    await inTx(db, async (tx) => {
      await tx.query(`update public.profiles set notify_game_started = false where id = $1`, [club.others[0]])
      const id = await startNow(tx)
      await rpc(tx, 'public.submit_round($1, 2100, 300)', [id])
      await rpc(tx, 'public.confirm_result($1)', [id])
      const rows = await finishedPushes(tx, id)
      expect(rows.map((r) => r.user_id)).not.toContain(club.others[0])
      expect(rows).toHaveLength(4)
    })
  })
})
