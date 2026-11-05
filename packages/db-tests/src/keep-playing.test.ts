import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Keep', 1)
}, 120_000)

const game = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{ status: string; proposed: boolean; winner: string | null }>(
    `select status, result_proposed_at is not null as proposed, winner_team as winner from public.games where id = $1`,
    [id],
  )
  return rows[0]
}

/** A start-now game by players[0] where team A has just reached the 2000 target. */
const atTarget = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[0])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  await rpc(tx, 'public.submit_round($1, 2100, 300)', [id])
  return id
}

describe('reaching the target asks instead of ending the game', () => {
  it('proposes the result but keeps the game live', async () => {
    await inTx(db, async (tx) => {
      const id = await atTarget(tx)
      expect(await game(tx, id)).toEqual({ status: 'live', proposed: true, winner: null })
    })
  })

  it('ends it when the scorer confirms', async () => {
    await inTx(db, async (tx) => {
      const id = await atTarget(tx)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.confirm_result($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'finished', proposed: true, winner: 'A' })
    })
  })

  it('keeps playing: extra rounds count, and the question comes back after the next round', async () => {
    await inTx(db, async (tx) => {
      const id = await atTarget(tx)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.continue_game($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'live', proposed: false, winner: null })
      await rpc(tx, 'public.submit_round($1, 50, 900)', [id])
      expect(await game(tx, id)).toEqual({ status: 'live', proposed: true, winner: null })
      const { rows } = await tx.query<{ type: string }>(
        `select type from public.game_events where game_id = $1 and type = 'result_continued'`,
        [id],
      )
      expect(rows).toHaveLength(1)
    })
  })

  it('only the table can choose to keep playing, and only when a result is waiting', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await rejects(tx, () => rpc(tx, 'public.continue_game($1)', [id]), /no result to/)
      await rpc(tx, 'public.submit_round($1, 2100, 300)', [id])
      // others[0] is a member who is not at this table.
      await actAs(tx, club.others[0]!)
      await rejects(tx, () => rpc(tx, 'public.continue_game($1)', [id]), /not seated/)
    })
  })
})

describe('ending a game the table kept playing', () => {
  it('ends it at any time with the score as it is, no new round needed', async () => {
    await inTx(db, async (tx) => {
      const id = await atTarget(tx)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.continue_game($1)', [id])
      await rpc(tx, 'public.submit_round($1, 10, 20)', [id])
      await rpc(tx, 'public.continue_game($1)', [id])
      await rpc(tx, 'public.end_continued_game($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'live', proposed: true, winner: null })
      await rpc(tx, 'public.confirm_result($1)', [id])
      expect(await game(tx, id)).toEqual({ status: 'finished', proposed: true, winner: 'A' })
      await tx.exec('reset role')
      const { rows } = await tx.query<{ a: number; b: number }>(
        `select team_a_total as a, team_b_total as b from public.v_game_totals where game_id = $1`,
        [id],
      )
      expect(rows).toEqual([{ a: 2110, b: 320 }])
    })
  })

  it('is only for a game that was continued past the target, and not on a tie', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await rpc(tx, 'public.submit_round($1, 100, 50)', [id])
      await rejects(tx, () => rpc(tx, 'public.end_continued_game($1)', [id]), /kept playing past the target/)
      await rpc(tx, 'public.submit_round($1, 2000, 0)', [id])
      await rpc(tx, 'public.continue_game($1)', [id])
      await rpc(tx, 'public.submit_round($1, 0, 2050)', [id])
      // B reached A: level at 2100, the popup does not come; ending now would be a tie.
      await rejects(tx, () => rpc(tx, 'public.end_continued_game($1)', [id]), /level/)
    })
  })

  it('refuses someone who is not at the table', async () => {
    await inTx(db, async (tx) => {
      const id = await atTarget(tx)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.continue_game($1)', [id])
      await actAs(tx, club.others[0]!)
      await rejects(tx, () => rpc(tx, 'public.end_continued_game($1)', [id]), /not seated/)
    })
  })
})
