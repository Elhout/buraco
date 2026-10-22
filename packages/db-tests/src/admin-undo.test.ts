import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Undo')
}, 120_000)

const startWithRound = async (tx: Parameters<Parameters<typeof inTx>[1]>[0]): Promise<{ game: string; round: string }> => {
  await actAs(tx, club.players[0])
  const game = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  const round = await rpc<string>(tx, 'public.submit_round($1, 300, 120)', [game])
  return { game, round }
}

const roundRow = (tx: Parameters<Parameters<typeof inTx>[1]>[0], id: string) =>
  tx.query<{ status: string }>(`select status from public.rounds where id = $1`, [id])

describe('undo', () => {
  it('removes the round completely when the owner undoes it', async () => {
    await inTx(db, async (tx) => {
      const { game, round } = await startWithRound(tx)
      await tx.query(`select public.request_undo($1)`, [game])
      await tx.exec('reset role')
      expect((await roundRow(tx, round)).rows).toHaveLength(0)
      const { rows } = await tx.query(`select 1 from public.game_events where game_id = $1 and type = 'undo'`, [game])
      expect(rows).toHaveLength(1)
    })
  })

  it('keeps the round as undone (struck through) when another player undoes it', async () => {
    await inTx(db, async (tx) => {
      const { game, round } = await startWithRound(tx)
      await actAs(tx, club.players[1])
      await tx.query(`select public.request_undo($1)`, [game])
      await tx.exec('reset role')
      expect((await roundRow(tx, round)).rows).toEqual([{ status: 'voided' }])
    })
  })
})
