import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let outsider: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Swap', 3)
  // others[0] is an admin; others[1] and others[2] are plain members not seated below.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
  outsider = await createUser(db, 'Stranger')
}, 120_000)

const host = () => club.players[1]
const free = () => club.others[1]!

/** A live start-now game created by `host`: seat 4 (team B) is the guest "Uncle", one round played. */
const gameWithGuest = async (tx: Transaction): Promise<string> => {
  const seats = normalSeats(club).map((s) => (s.seat === 4 ? { seat: 4, team: 'B' as const, guest_name: 'Uncle' } : s))
  await actAs(tx, host())
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(seats)])
  await rpc(tx, 'public.submit_round($1, 100, 50)', [id])
  return id
}

const seat4 = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  return (
    await tx.query<{ user_id: string | null; guest_name: string | null; invite_status: string }>(
      `select user_id, guest_name, invite_status from public.game_seats where game_id = $1 and seat = 4`,
      [id],
    )
  ).rows[0]
}

describe('replace_guest', () => {
  it("lets the game's creator put a member in a guest's seat, mid-game and logged", async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      await rpc(tx, 'public.replace_guest($1, 4, $2)', [id, free()])
      expect(await seat4(tx, id)).toEqual({ user_id: free(), guest_name: null, invite_status: 'confirmed' })
      const { rows } = await tx.query<{ payload: Record<string, unknown> }>(
        `select payload from public.game_events where game_id = $1 and type = 'guest_replaced'`,
        [id],
      )
      expect(rows[0]?.payload).toMatchObject({ seat: 4, guest_name: 'Uncle', user_id: free() })
      // The rounds already played stay as they are.
      expect((await tx.query(`select 1 from public.rounds where game_id = $1 and status = 'confirmed'`, [id])).rows).toHaveLength(1)
    })
  })

  it('lets an admin do it too', async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      await actAs(tx, club.others[0]!)
      await rpc(tx, 'public.replace_guest($1, 4, $2)', [id, free()])
      expect((await seat4(tx, id))?.user_id).toBe(free())
    })
  })

  it('refuses other players', async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      await actAs(tx, club.players[2])
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 4, $2)', [id, free()]), /only the game creator or an admin/)
    })
  })

  it('only replaces guests, with club members who are not already playing', async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 1, $2)', [id, free()]), /not a guest/)
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 4, $2)', [id, outsider]), /not a member of this club/)
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 4, $2)', [id, club.players[0]]), /already in this game/)
    })
  })

  it('refuses someone who is at another table', async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      // others[2] is playing elsewhere: a second table with three guests.
      await actAs(tx, club.others[2]!)
      const seats = [
        { seat: 1, team: 'A', user_id: club.others[2] },
        { seat: 2, team: 'B', guest_name: 'G1' },
        { seat: 3, team: 'A', guest_name: 'G2' },
        { seat: 4, team: 'B', guest_name: 'G3' },
      ]
      await rpc(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(seats)])
      await actAs(tx, host())
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 4, $2)', [id, club.others[2]]), /already playing another game/)
    })
  })

  it('only works while the game is current', async () => {
    await inTx(db, async (tx) => {
      const id = await gameWithGuest(tx)
      await rpc(tx, 'public.submit_round($1, 2000, 0)', [id])
      await rpc(tx, 'public.confirm_result($1)', [id])
      await rejects(tx, () => rpc(tx, 'public.replace_guest($1, 4, $2)', [id, free()]), /only during a current game/)
    })
  })
})
