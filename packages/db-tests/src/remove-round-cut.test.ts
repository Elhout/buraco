import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Cut', 1)
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
}, 120_000)

// players[0] owns the club; players[2] (a member, seat 2, team B) creates the games below.
const owner = () => club.players[0]
const host = () => club.players[2]
const admin = () => club.others[0]!

/** A live start-now game by `host`: round 1 is A 300, B 200 with a +100 cut for seat 1 (team A). */
const gameWithCut = async (tx: Transaction): Promise<{ gameId: string; roundId: string; lineId: string }> => {
  await actAs(tx, host())
  const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  const roundId = await rpc<string>(tx, 'public.submit_round($1, 300, 200, $2::smallint[])', [gameId, [1]])
  const { rows } = await tx.query<{ id: string }>(`select id from public.round_lines where round_id = $1`, [roundId])
  return { gameId, roundId, lineId: rows[0]!.id }
}

const state = async (tx: Transaction, gameId: string, roundId: string) => {
  await tx.exec('reset role')
  const totals = (
    await tx.query<{ a: number; b: number }>(`select team_a_total as a, team_b_total as b from public.v_game_totals where game_id = $1`, [
      gameId,
    ])
  ).rows[0]
  const marked =
    (await tx.query<{ by: string | null }>(`select edited_by as by from public.rounds where id = $1`, [roundId])).rows[0]?.by ?? null
  const cuts = (await tx.query(`select 1 from public.round_lines where round_id = $1`, [roundId])).rows.length
  return { ...totals, cuts, markedBy: marked }
}

describe('remove_round_cut', () => {
  it("lets the game's creator take a saved round's +100 off, marked as their edit", async () => {
    await inTx(db, async (tx) => {
      const { gameId, roundId, lineId } = await gameWithCut(tx)
      expect(await state(tx, gameId, roundId)).toMatchObject({ a: 400, b: 200, cuts: 1 })
      await actAs(tx, host())
      await rpc(tx, 'public.remove_round_cut($1)', [lineId])
      expect(await state(tx, gameId, roundId)).toEqual({ a: 300, b: 200, cuts: 0, markedBy: host() })
      const { rows } = await tx.query<{ payload: Record<string, unknown> }>(
        `select payload from public.game_events where game_id = $1 and type = 'round_edited'`,
        [gameId],
      )
      expect(rows[0]?.payload).toMatchObject({ cut_removed: true, silent: false })
    })
  })

  it('is silent for the owner and admins', async () => {
    await inTx(db, async (tx) => {
      for (const who of [owner(), admin()]) {
        const { gameId, roundId, lineId } = await gameWithCut(tx)
        await actAs(tx, who)
        await rpc(tx, 'public.remove_round_cut($1)', [lineId])
        expect(await state(tx, gameId, roundId)).toEqual({ a: 300, b: 200, cuts: 0, markedBy: null })
        await actAs(tx, owner())
        await rpc(tx, 'public.abandon_game($1)', [gameId])
      }
    })
  })

  it('refuses other players', async () => {
    await inTx(db, async (tx) => {
      const { lineId } = await gameWithCut(tx)
      await actAs(tx, club.players[3])
      await rejects(tx, () => rpc(tx, 'public.remove_round_cut($1)', [lineId]), /only the owner or the game creator/)
    })
  })

  it('in a finished game (owner only) the winner follows the new totals', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, host())
      const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      const roundId = await rpc<string>(tx, 'public.submit_round($1, 1950, 2000, $2::smallint[])', [gameId, [1]])
      await rpc(tx, 'public.confirm_result($1)', [gameId])
      await tx.exec('reset role')
      expect((await tx.query(`select winner_team from public.games where id = $1`, [gameId])).rows).toEqual([{ winner_team: 'A' }])
      const { rows } = await tx.query<{ id: string }>(`select id from public.round_lines where round_id = $1`, [roundId])
      await actAs(tx, host())
      await rejects(tx, () => rpc(tx, 'public.remove_round_cut($1)', [rows[0]!.id]), /only the owner can do this/)
      await actAs(tx, owner())
      await rpc(tx, 'public.remove_round_cut($1)', [rows[0]!.id])
      await tx.exec('reset role')
      expect((await tx.query(`select winner_team from public.games where id = $1`, [gameId])).rows).toEqual([{ winner_team: 'B' }])
    })
  })
})
