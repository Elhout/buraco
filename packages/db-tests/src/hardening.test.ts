import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, PIN, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Hard', 2)
}, 120_000)

/** Normal seats with the last `guests` seats replaced by guest names (ghost mode). */
const ghostSeats = (c: Club, guests: number) =>
  normalSeats(c).map((s, i) => (i >= 4 - guests ? { seat: s.seat, team: s.team, guest_name: `G${i}` } : s))

describe('abuse limits', () => {
  it('caps a host at 5 casual games in progress', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      // All-guest tables: a player can only sit at one live table (one-game-at-a-time rule).
      const create = () => rpc(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(ghostSeats(club, 4))])
      for (let i = 0; i < 5; i++) await create()
      await rejects(tx, create, /too many games/)
    })
  })

  it('throttles invite-code guessing after 10 failures in an hour', async () => {
    const guesser = await createUser(db, 'Guesser')
    await inTx(db, async (tx) => {
      await actAs(tx, guesser)
      for (let i = 0; i < 10; i++) expect(await rpc(tx, 'public.join_club($1)', ['ZZZZZZ'])).toBeNull()
      await rejects(tx, () => rpc(tx, 'public.join_club($1)', ['YYYYYY']), /too many invite code attempts/)
    })
  })

  it('only lets owners and admins organize tournaments, with at most 64 entrants', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[1])
      await rejects(tx, () => rpc(tx, `public.create_tournament($1, 'X', 'swiss', 'rotating')`, [club.clubId]), /owners and admins/)
      await actAs(tx, club.players[0])
      const tid = await rpc<string>(tx, `public.create_tournament($1, 'X', 'swiss', 'rotating')`, [club.clubId])
      const many = Array.from({ length: 68 }, (_, i) => ({ guest_name: `Guest ${i}` }))
      await rejects(tx, () => tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(many)]), /at most 64/)
    })
  })

  it('bounds club config and avatar URLs', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      await rejects(tx, () => tx.query(`update public.clubs set cut_bonus = 5000000 where id = $1`, [club.clubId]), /cut_bonus_max/)
      await rejects(
        tx,
        () => tx.query(`update public.profiles set avatar_url = 'javascript:alert(1)' where id = $1`, [club.players[0]]),
        /avatar_url_https/,
      )
    })
  })
})

describe('ghost games need two real members to count', () => {
  it('keeps a member-plus-three-guests game out of the stats even when verified', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(ghostSeats(club, 3))])
      const r = await rpc<string>(tx, 'public.submit_round($1, 2000, 0)', [id])
      await rpc(tx, 'public.confirm_round($1)', [r])
      await rpc(tx, 'public.confirm_result($1)', [id])
      await rpc(tx, 'public.verify_ghost_seat($1, $2)', [id, PIN])
      expect((await tx.query(`select 1 from public.v_player_games where game_id = $1`, [id])).rows).toHaveLength(0)
    })
  })
})

describe('tournament close-out', () => {
  const startOneTable = async (tx: Parameters<Parameters<typeof inTx>[1]>[0]): Promise<string> => {
    await actAs(tx, club.players[0])
    const tid = await rpc<string>(tx, `public.create_tournament($1, 'Cup', 'swiss', 'rotating')`, [club.clubId])
    await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(club.players.map((u) => ({ user_id: u })))])
    await tx.query(`select public.start_tournament($1)`, [tid])
    await tx.exec('reset role')
    const ids = (
      await tx.query<{ id: string }>(`select id from public.tournament_entries where tournament_id = $1 order by id`, [tid])
    ).rows.map((r) => r.id)
    await actAs(tx, club.players[0])
    const draw = [{ table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2) }]
    await tx.query(`select public.start_round($1, $2::jsonb)`, [tid, JSON.stringify(draw)])
    return tid
  }

  it('finishes a round whose only match was abandoned, and refuses edits once the tournament is closed', async () => {
    await inTx(db, async (tx) => {
      const tid = await startOneTable(tx)
      await tx.exec('reset role')
      const { rows: g } = await tx.query<{ id: string; host_id: string }>(
        `select g.id, g.host_id from public.games g join public.v_tournament_matches m on m.game_id = g.id where m.tournament_id = $1`,
        [tid],
      )
      await actAs(tx, g[0]!.host_id)
      await tx.query(`select public.abandon_game($1)`, [g[0]!.id])
      await tx.exec('reset role')
      const { rows } = await tx.query(`select status from public.tournament_rounds where tournament_id = $1`, [tid])
      expect(rows).toEqual([{ status: 'finished' }])

      const match = (
        await tx.query<{ id: string }>(
          `select m.id from public.tournament_matches m join public.tournament_rounds r on r.id = m.tournament_round_id where r.tournament_id = $1`,
          [tid],
        )
      ).rows[0]!.id
      await actAs(tx, club.players[0])
      await tx.query(`select public.finish_tournament($1)`, [tid])
      await rejects(tx, () => tx.query(`select public.edit_match_result($1, 'a', 1, 0, 'late fix')`, [match]), /tournament is closed/)
    })
  })

  it('does not reveal entrant names outside the club', async () => {
    const stranger = await createUser(db, 'Stranger')
    await inTx(db, async (tx) => {
      const tid = await startOneTable(tx)
      await tx.exec('reset role')
      const entry = (await tx.query<{ id: string }>(`select id from public.tournament_entries where tournament_id = $1 limit 1`, [tid]))
        .rows[0]!.id
      await actAs(tx, stranger)
      expect(await rpc(tx, 'public.entry_name($1)', [entry])).toBeNull()
    })
  })
})

describe('devices', () => {
  it('keeps at most 10 devices per user', async () => {
    const user = await createUser(db, 'Gadgets')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      for (let i = 0; i < 12; i++) await tx.query(`select public.register_device($1, 'ios')`, [`ExponentPushToken[t${i}]`])
      expect((await tx.query(`select 1 from public.devices`)).rows).toHaveLength(10)
    })
  })
})
