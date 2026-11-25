import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Back', 1)
  // others[0] is an admin who is not playing; players[3] is a plain member.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
}, 120_000)

const admin = () => club.others[0]!

const game = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{ status: string; winner: string | null; finished: boolean; a: number; b: number }>(
    `select g.status, g.winner_team as winner, g.finished_at is not null as finished, t.team_a_total as a, t.team_b_total as b
     from public.games g join public.v_game_totals t on t.game_id = g.id where g.id = $1`,
    [id],
  )
  return rows[0]
}

/** A start-now game with 1870 – 1830 on the board that an admin ended by mistake. */
const abandonedByMistake = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[1])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  await rpc(tx, 'public.submit_round($1, 1870, 1830)', [id])
  await actAs(tx, admin())
  await rpc(tx, 'public.end_game($1)', [id])
  return id
}

describe('restore_game (owner and admins)', () => {
  it('brings an abandoned game back to live with its rounds', async () => {
    await inTx(db, async (tx) => {
      const id = await abandonedByMistake(tx)
      await actAs(tx, admin())
      await rpc(tx, 'public.restore_game($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'live', winner: null, finished: false, a: 1870, b: 1830 })
      const { rows } = await tx.query(`select 1 from public.game_events where game_id = $1 and type = 'restored'`, [id])
      expect(rows).toHaveLength(1)
    })
  })

  it('refuses plain members, live games, and players already at another table', async () => {
    await inTx(db, async (tx) => {
      const id = await abandonedByMistake(tx)
      await actAs(tx, club.players[3])
      await rejects(tx, () => rpc(tx, 'public.restore_game($1)', [id]), /owner or an admin/)
      await actAs(tx, club.players[0])
      const other = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await rejects(tx, () => rpc(tx, 'public.restore_game($1)', [other]), /only an abandoned game/)
      await rejects(tx, () => rpc(tx, 'public.restore_game($1)', [id]), /already playing another game/)
    })
  })
})

describe('admin_finish_game (owner and admins)', () => {
  it('ends a live game now with the leading team as the winner, counted in stats', async () => {
    await inTx(db, async (tx) => {
      const id = await abandonedByMistake(tx)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.restore_game($1)', [id])
      await rpc(tx, 'public.admin_finish_game($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'finished', winner: 'A', finished: true, a: 1870, b: 1830 })
    })
  })

  it('refuses a tie and plain members', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[1])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await rpc(tx, 'public.submit_round($1, 500, 500)', [id])
      await actAs(tx, admin())
      await rejects(tx, () => rpc(tx, 'public.admin_finish_game($1)', [id]), /level/)
      await actAs(tx, club.players[3])
      await rejects(tx, () => rpc(tx, 'public.admin_finish_game($1)', [id]), /owner or an admin/)
    })
  })
})
