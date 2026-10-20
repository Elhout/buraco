import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Trust', 2)
}, 120_000)

/** Two members and two guests: enough real players to count in the stats. */
const twoGuests = (c: Club) => normalSeats(c).map((s, i) => (i >= 2 ? { seat: s.seat, team: s.team, guest_name: `G${i}` } : s))

const playToEnd = async (tx: Parameters<Parameters<typeof inTx>[1]>[0]): Promise<string> => {
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(twoGuests(club))])
  const r = await rpc<string>(tx, 'public.submit_round($1, 2000, 0)', [id])
  await rpc(tx, 'public.confirm_round($1)', [r])
  await rpc(tx, 'public.confirm_result($1)', [id])
  return id
}

describe('start-now (ghost) games in a club that trusts its scorekeepers', () => {
  it('snapshots the club choice and counts the game as soon as it finishes', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await playToEnd(tx)
      const { rows } = await tx.query<{ verified: boolean; trust: string }>(
        `select verified, config_snapshot ->> 'trust_ghost' as trust from public.games where id = $1`,
        [id],
      )
      expect(rows).toEqual([{ verified: true, trust: 'true' }])
      expect((await tx.query(`select user_id from public.v_player_games where game_id = $1`, [id])).rows).toHaveLength(2)
    })
  })

  it('keeps the PIN-verification flow for clubs that turn trust off', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      await tx.query(`update public.clubs set trust_ghost_games = false where id = $1`, [club.clubId])
      const id = await playToEnd(tx)
      expect((await tx.query(`select verified from public.games where id = $1`, [id])).rows).toEqual([{ verified: false }])
      expect((await tx.query(`select 1 from public.v_player_games where game_id = $1`, [id])).rows).toHaveLength(0)
    })
  })

  it('does not let a plain member change the setting', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[1])
      await tx.query(`update public.clubs set trust_ghost_games = false where id = $1`, [club.clubId])
      expect((await tx.query(`select trust_ghost_games from public.clubs where id = $1`, [club.clubId])).rows).toEqual([
        { trust_ghost_games: true },
      ])
    })
  })
})

describe('verify prompts', () => {
  it('sends no "please verify" push for a game that already counts', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await playToEnd(tx)
      await tx.exec('reset role')
      const { rows } = await tx.query(`select 1 from public.notification_queue where game_id = $1 and event = 'ghost_verify'`, [id])
      expect(rows).toHaveLength(0)
    })
  })
})
