import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Busy', 4)
}, 120_000)

/** Start-now game with the given four members (seats 1-4). */
const start = (tx: Parameters<Parameters<typeof inTx>[1]>[0], players: readonly string[]) =>
  rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [
    club.clubId,
    JSON.stringify(normalSeats(club).map((s, i) => ({ seat: s.seat, team: s.team, user_id: players[i] }))),
  ])

describe('one game at a time', () => {
  it('refuses to seat a player who is already in a live game', async () => {
    await inTx(db, async (tx) => {
      const p = [...club.players, ...club.others]
      await actAs(tx, p[0]!)
      await start(tx, [p[0]!, p[1]!, p[2]!, p[3]!])
      await actAs(tx, p[4]!)
      await rejects(tx, () => start(tx, [p[4]!, p[5]!, p[6]!, p[0]!]), /already playing another game/)
    })
  })

  it('frees the player once that game is over', async () => {
    await inTx(db, async (tx) => {
      const p = [...club.players, ...club.others]
      await actAs(tx, p[0]!)
      const first = await start(tx, [p[0]!, p[1]!, p[2]!, p[3]!])
      const r = await rpc<string>(tx, 'public.submit_round($1, 2000, 0)', [first])
      await rpc(tx, 'public.confirm_round($1)', [r])
      await rpc(tx, 'public.confirm_result($1)', [first])
      await actAs(tx, p[4]!)
      const second = await start(tx, [p[4]!, p[5]!, p[6]!, p[0]!])
      expect(second).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  it('lets guests sit at several tables at once', async () => {
    await inTx(db, async (tx) => {
      const p = [...club.players, ...club.others]
      await actAs(tx, p[0]!)
      const guests = (players: readonly string[]) =>
        JSON.stringify(
          normalSeats(club).map((s, i) =>
            i < 2 ? { seat: s.seat, team: s.team, user_id: players[i] } : { seat: s.seat, team: s.team, guest_name: `Guest ${i - 1}` },
          ),
        )
      await rpc(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, guests([p[0]!, p[1]!])])
      await actAs(tx, p[2]!)
      const other = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, guests([p[2]!, p[3]!])])
      expect(other).toMatch(/^[0-9a-f-]{36}$/)
    })
  })
})
