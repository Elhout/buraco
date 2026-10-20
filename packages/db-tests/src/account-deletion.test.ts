import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { PIN, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

describe('anonymize_user + auth deletion', () => {
  it('keeps past games for the others, hands over the club, and lets the auth user be deleted', async () => {
    const club = await seedClub(db, 'Leaving')
    const [owner, partner, opp1, opp2] = club.players
    await inTx(db, async (tx) => {
      // A finished verified game with the leaver (owner) in it.
      await actAs(tx, owner)
      const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
      for (const p of [opp1, partner, opp2]) {
        await actAs(tx, p)
        await rpc(tx, 'public.respond_invite($1, true, $2)', [gameId, PIN])
      }
      await actAs(tx, owner)
      const r = await rpc<string>(tx, 'public.submit_round($1, 2000, 100)', [gameId])
      await actAs(tx, opp1)
      await rpc(tx, 'public.confirm_round($1, $2)', [r, PIN])
      for (const p of [owner, opp1]) {
        await actAs(tx, p)
        await rpc(tx, 'public.confirm_result($1, $2)', [gameId, PIN])
      }
      // The admin inherits the club.
      await actAs(tx, owner)
      await tx.query(`select public.set_member_role($1, $2, 'admin')`, [club.clubId, opp2])

      await asService(tx, () => tx.query(`select public.anonymize_user($1)`, [owner]))
      await tx.query(`delete from auth.users where id = $1`, [owner])

      const { rows: clubRows } = await tx.query(`select owner_id from public.clubs where id = $1`, [club.clubId])
      expect(clubRows).toEqual([{ owner_id: opp2 }])
      const { rows: seats } = await tx.query(`select seat, user_id, guest_name from public.game_seats where game_id = $1 and seat = 1`, [
        gameId,
      ])
      expect(seats).toEqual([{ seat: 1, user_id: null, guest_name: 'Former member' }])
      const { rows: game } = await tx.query(`select status, winner_team, host_id from public.games where id = $1`, [gameId])
      expect(game).toEqual([{ status: 'finished', winner_team: 'A', host_id: null }])
      // The partner's stats still count the game.
      await actAs(tx, partner)
      const { rows: stats } = await tx.query<{ games: number; wins: number }>(
        `select games, wins from public.v_player_stats where user_id = $1`,
        [partner],
      )
      expect(stats).toEqual([{ games: 1, wins: 1 }])
    })
  })

  it('deletes a club with no other members and abandons unfinished games', async () => {
    const solo = await createUser(db, 'Solo')
    await inTx(db, async (tx) => {
      await actAs(tx, solo)
      const clubId = await rpc<string>(tx, `public.create_club('Just me')`)
      await asService(tx, () => tx.query(`select public.anonymize_user($1)`, [solo]))
      await tx.query(`delete from auth.users where id = $1`, [solo])
      expect((await tx.query(`select 1 from public.clubs where id = $1`, [clubId])).rows).toHaveLength(0)
    })
    const club = await seedClub(db, 'Busy')
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await asService(tx, () => tx.query(`select public.anonymize_user($1)`, [club.players[2]]))
      const { rows } = await tx.query(`select status from public.games where id = $1`, [gameId])
      expect(rows).toEqual([{ status: 'abandoned' }])
    })
  })

  it('is service-role only', async () => {
    const user = await createUser(db, 'Curious')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await rejects(tx, () => tx.query(`select public.anonymize_user($1)`, [user]), /permission denied/)
    })
  })
})
