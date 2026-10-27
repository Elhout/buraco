import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Edit')
}, 120_000)

// players[0] owns the club; players[2] is a plain member who creates the games below.
const owner = () => club.players[0]
const host = () => club.players[2]
const other = () => club.players[3]

/** A live start-now game created by `host`, with one counted round (A 300, B 200). */
const liveGame = async (tx: Transaction): Promise<{ gameId: string; roundId: string }> => {
  await actAs(tx, host())
  const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  const roundId = await rpc<string>(tx, 'public.submit_round($1, 300, 200)', [gameId])
  return { gameId, roundId }
}

const round = async (tx: Transaction, id: string) =>
  (
    await tx.query<{ a: number; b: number; edited: boolean }>(
      `select team_a_score as a, team_b_score as b, edited_at is not null as edited from public.rounds where id = $1`,
      [id],
    )
  ).rows[0]

const editEvents = async (tx: Transaction, gameId: string) =>
  (
    await tx.query<{ actor_id: string; payload: Record<string, unknown> }>(
      `select actor_id, payload from public.game_events where game_id = $1 and type = 'round_edited' order by created_at`,
      [gameId],
    )
  ).rows

describe('editing a round of a live game', () => {
  it('lets the game creator fix a round, marked as edited for everyone', async () => {
    await inTx(db, async (tx) => {
      const { gameId, roundId } = await liveGame(tx)
      await rpc(tx, 'public.edit_round_scores($1, 350, 150)', [roundId])
      expect(await round(tx, roundId)).toEqual({ a: 350, b: 150, edited: true })
      const events = await editEvents(tx, gameId)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ actor_id: host(), payload: { silent: false, old_a: 300, new_a: 350 } })
    })
  })

  it("lets the club owner edit without an 'edited' mark (silent)", async () => {
    await inTx(db, async (tx) => {
      const { gameId, roundId } = await liveGame(tx)
      await actAs(tx, owner())
      await rpc(tx, 'public.edit_round_scores($1, 100, 400)', [roundId])
      expect(await round(tx, roundId)).toEqual({ a: 100, b: 400, edited: false })
      expect((await editEvents(tx, gameId))[0]?.payload).toMatchObject({ silent: true })
    })
  })

  it("keeps the creator's mark when the owner edits the same round afterwards", async () => {
    await inTx(db, async (tx) => {
      const { roundId } = await liveGame(tx)
      await rpc(tx, 'public.edit_round_scores($1, 350, 150)', [roundId])
      await actAs(tx, owner())
      await rpc(tx, 'public.edit_round_scores($1, 360, 140)', [roundId])
      expect(await round(tx, roundId)).toEqual({ a: 360, b: 140, edited: true })
    })
  })

  it('refuses other players, even in the game', async () => {
    await inTx(db, async (tx) => {
      const { roundId } = await liveGame(tx)
      await actAs(tx, other())
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 1, 2)', [roundId]), /only the owner or the game creator/)
    })
  })

  it('leaves finished games to the owner', async () => {
    await inTx(db, async (tx) => {
      const { gameId } = await liveGame(tx)
      const last = await rpc<string>(tx, 'public.submit_round($1, 2000, 0)', [gameId])
      await rpc(tx, 'public.confirm_result($1)', [gameId])
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 2100, 0)', [last]), /only the owner can do this/)
    })
  })
})
