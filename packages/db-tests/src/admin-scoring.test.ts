import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, PIN, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'AdmScore', 2)
  // others[0] is an admin and others[1] a plain member; neither sits at the tables below.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
}, 120_000)

const admin = () => club.others[0]!
const bystander = () => club.others[1]!

const counted = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  return (
    await tx.query<{ a: number; b: number; n: number }>(
      `select t.team_a_total as a, t.team_b_total as b,
            (select count(*)::int from public.rounds r where r.game_id = t.game_id and r.status = 'confirmed') as n
     from public.v_game_totals t where t.game_id = $1`,
      [id],
    )
  ).rows[0]
}

/** A live game with invites (normal mode), all four players confirmed. */
const liveNormal = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[0])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
  for (const who of [2, 1, 3]) {
    await actAs(tx, club.players[who]!)
    await rpc(tx, 'public.respond_invite($1, true, $2)', [id, PIN])
  }
  return id
}

describe('admins keep score in any running game', () => {
  it('adds a round to a game with invites; it counts at once (no PIN confirmation)', async () => {
    await inTx(db, async (tx) => {
      const id = await liveNormal(tx)
      await actAs(tx, admin())
      await rpc(tx, 'public.submit_round($1, 300, 120)', [id])
      expect(await counted(tx, id)).toEqual({ a: 300, b: 120, n: 1 })
    })
  })

  it('adds rounds and +100 cuts to a start-now game, and undoes the last round', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await actAs(tx, admin())
      await rpc(tx, 'public.add_cut($1, 2::smallint)', [id])
      await rpc(tx, 'public.submit_round($1, 50, 200)', [id])
      expect(await counted(tx, id)).toEqual({ a: 50, b: 300, n: 1 })
      await actAs(tx, admin())
      await rpc(tx, 'public.request_undo($1)', [id])
      expect(await counted(tx, id)).toEqual({ a: 0, b: 0, n: 0 })
    })
  })

  it('undoes the last round of a game with invites at once', async () => {
    await inTx(db, async (tx) => {
      const id = await liveNormal(tx)
      await actAs(tx, admin())
      await rpc(tx, 'public.submit_round($1, 300, 120)', [id])
      await actAs(tx, admin())
      await rpc(tx, 'public.request_undo($1)', [id])
      expect((await counted(tx, id))?.n).toBe(0)
    })
  })

  it('still refuses a member who is not at the table', async () => {
    await inTx(db, async (tx) => {
      const id = await liveNormal(tx)
      await actAs(tx, bystander())
      await rejects(tx, () => rpc(tx, 'public.submit_round($1, 300, 120)', [id]), /not seated/)
    })
  })
})
