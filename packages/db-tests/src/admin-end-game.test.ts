import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Adm', 1)
  // others[0] is an admin who is not playing; players[3] is a plain member.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
}, 120_000)

const admin = () => club.others[0]!
const member = () => club.players[3]

/** A live start-now game created by players[1] (not the owner), with one counted round. */
const liveGame = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[1])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  await rpc(tx, 'public.submit_round($1, 100, 50)', [id])
  return id
}

const status = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  return (await tx.query<{ status: string }>(`select status from public.games where id = $1`, [id])).rows[0]?.status ?? null
}

describe('end_game (owner and admins)', () => {
  it('lets an admin end a live game at once, logged', async () => {
    await inTx(db, async (tx) => {
      const id = await liveGame(tx)
      await actAs(tx, admin())
      await rpc(tx, 'public.end_game($1)', [id])
      expect(await status(tx, id)).toBe('abandoned')
      const { rows } = await tx.query<{ actor_id: string }>(
        `select actor_id from public.game_events where game_id = $1 and type = 'abandoned'`,
        [id],
      )
      expect(rows).toEqual([{ actor_id: admin() }])
    })
  })

  it('ends a game that is still collecting invites', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[1])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await actAs(tx, admin())
      await rpc(tx, 'public.end_game($1)', [id])
      expect(await status(tx, id)).toBe('abandoned')
    })
  })

  it('refuses plain members and finished games', async () => {
    await inTx(db, async (tx) => {
      const id = await liveGame(tx)
      await actAs(tx, member())
      await rejects(tx, () => rpc(tx, 'public.end_game($1)', [id]), /only the owner or an admin/)
      await actAs(tx, club.players[1])
      await rpc(tx, 'public.submit_round($1, 2000, 0)', [id])
      await rpc(tx, 'public.confirm_result($1)', [id])
      await actAs(tx, admin())
      await rejects(tx, () => rpc(tx, 'public.end_game($1)', [id]), /only a current game/)
    })
  })
})

describe('delete_game for admins', () => {
  it('lets an admin delete a current game', async () => {
    await inTx(db, async (tx) => {
      const id = await liveGame(tx)
      await actAs(tx, admin())
      await rpc(tx, 'public.delete_game($1)', [id])
      expect(await status(tx, id)).toBeNull()
    })
  })

  it('keeps finished games for the owner only', async () => {
    await inTx(db, async (tx) => {
      const id = await liveGame(tx)
      await rpc(tx, 'public.submit_round($1, 2000, 0)', [id])
      await rpc(tx, 'public.confirm_result($1)', [id])
      await actAs(tx, admin())
      await rejects(tx, () => rpc(tx, 'public.delete_game($1)', [id]), /only the owner can do this/)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.delete_game($1)', [id])
      expect(await status(tx, id)).toBeNull()
    })
  })

  it('refuses plain members', async () => {
    await inTx(db, async (tx) => {
      const id = await liveGame(tx)
      await actAs(tx, member())
      await rejects(tx, () => rpc(tx, 'public.delete_game($1)', [id]), /only the owner or an admin/)
    })
  })
})
