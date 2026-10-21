import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'OneStep', 1)
}, 120_000)

type Tx = Parameters<Parameters<typeof inTx>[1]>[0]

/** Start-now game hosted by players[0], all four players seated. */
const start = (tx: Tx): Promise<string> =>
  rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])

const game = async (tx: Tx, id: string) =>
  (
    await tx.query<{ status: string; winner_team: string | null; verified: boolean }>(
      `select status, winner_team, verified from public.games where id = $1`,
      [id],
    )
  ).rows[0]!

describe('start-now games: one step per round', () => {
  it('confirms a round as soon as it is submitted', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      const roundId = await rpc<string>(tx, 'public.submit_round($1, 300, 120)', [id])
      const { rows } = await tx.query(`select status, confirmed_at is not null as confirmed from public.rounds where id = $1`, [roundId])
      expect(rows).toEqual([{ status: 'confirmed', confirmed: true }])
      const totals = await tx.query(`select team_a_total, team_b_total from public.v_game_totals where game_id = $1`, [id])
      expect(totals.rows).toEqual([{ team_a_total: 300, team_b_total: 120 }])
      // Older apps still call confirm_round afterwards: answered, not an error.
      const res = await rpc<{ ok: boolean }>(tx, 'public.confirm_round($1)', [roundId])
      expect(res.ok).toBe(true)
    })
  })

  it('keeps exact-cut bonuses tapped before the round', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await rpc(tx, 'public.add_cut($1, 2::smallint)', [id])
      await rpc(tx, 'public.submit_round($1, 50, 60)', [id])
      const totals = await tx.query(`select team_a_total, team_b_total from public.v_game_totals where game_id = $1`, [id])
      expect(totals.rows).toEqual([{ team_a_total: 50, team_b_total: 160 }])
    })
  })

  it('finishes the game by itself when a team wins, and it counts in the stats', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await rpc(tx, 'public.submit_round($1, 2050, 300)', [id])
      expect(await game(tx, id)).toEqual({ status: 'finished', winner_team: 'A', verified: true })
      expect((await tx.query(`select 1 from public.v_player_games where game_id = $1`, [id])).rows).toHaveLength(4)
      // Older apps still tap "Confirm result": answered, not an error.
      const res = await rpc<{ ok: boolean }>(tx, 'public.confirm_result($1)', [id])
      expect(res.ok).toBe(true)
    })
  })

  it('keeps playing when both teams are level at the target', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await rpc(tx, 'public.submit_round($1, 2000, 2000)', [id])
      expect((await game(tx, id)).status).toBe('live')
      await rpc(tx, 'public.submit_round($1, 100, 0)', [id])
      expect(await game(tx, id)).toMatchObject({ status: 'finished', winner_team: 'A' })
    })
  })
})

describe('start-now games: anyone at the table can score', () => {
  it('lets another seated player enter rounds, undo and abandon', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await actAs(tx, club.players[2])
      await rpc(tx, 'public.submit_round($1, 100, 50)', [id])
      await tx.query(`select public.request_undo($1)`, [id])
      const { rows } = await tx.query(`select count(*)::int as n from public.rounds where game_id = $1 and status = 'confirmed'`, [id])
      expect(rows).toEqual([{ n: 0 }])
      await rpc(tx, 'public.abandon_game($1)', [id])
      expect((await game(tx, id)).status).toBe('abandoned')
    })
  })

  it('lets the owner score a game they are not playing', async () => {
    await inTx(db, async (tx) => {
      // players[1] hosts a table without the owner (players[0]).
      await actAs(tx, club.players[1])
      const seats = normalSeats(club).map((s) => (s.seat === 1 ? { seat: 1, team: 'A', user_id: club.others[0] } : s))
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(seats)])
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.submit_round($1, 10, 20)', [id])
      expect((await tx.query(`select 1 from public.rounds where game_id = $1 and status = 'confirmed'`, [id])).rows).toHaveLength(1)
    })
  })

  it('refuses a member who is not at the table', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await actAs(tx, club.others[0]!)
      await rejects(tx, () => rpc(tx, 'public.submit_round($1, 10, 20)', [id]), /not seated/)
    })
  })

  it('refuses someone outside the group', async () => {
    const stranger = await createUser(db, 'Stranger')
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await start(tx)
      await actAs(tx, stranger)
      await rejects(tx, () => rpc(tx, 'public.submit_round($1, 10, 20)', [id]), /not a member/)
    })
  })
})

describe('tournament results', () => {
  const tournamentTable = async (tx: Tx): Promise<{ tid: string; gameId: string; matchId: string }> => {
    await actAs(tx, club.players[0])
    const tid = await rpc<string>(tx, `public.create_tournament($1, 'Cup', 'swiss', 'rotating')`, [club.clubId])
    await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(club.players.map((u) => ({ user_id: u })))])
    await tx.query(`select public.start_tournament($1)`, [tid])
    await tx.exec('reset role')
    const ids = (
      await tx.query<{ id: string }>(`select id from public.tournament_entries where tournament_id = $1 order by id`, [tid])
    ).rows.map((r) => r.id)
    await actAs(tx, club.players[0])
    await tx.query(`select public.start_round($1, $2::jsonb)`, [
      tid,
      JSON.stringify([{ table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2) }]),
    ])
    await tx.exec('reset role')
    const { rows } = await tx.query<{ game_id: string; match_id: string }>(
      `select m.game_id, m.id as match_id from public.tournament_matches m
       join public.tournament_rounds r on r.id = m.tournament_round_id where r.tournament_id = $1`,
      [tid],
    )
    return { tid, gameId: rows[0]!.game_id, matchId: rows[0]!.match_id }
  }

  it('finishes a match game by itself and records the result', async () => {
    await inTx(db, async (tx) => {
      const { gameId, matchId } = await tournamentTable(tx)
      const { rows: seat } = await tx.query<{ user_id: string }>(
        `select user_id from public.game_seats where game_id = $1 and user_id is not null limit 1`,
        [gameId],
      )
      await actAs(tx, seat[0]!.user_id)
      await rpc(tx, 'public.submit_round($1, 0, 2500)', [gameId])
      await tx.exec('reset role')
      expect((await tx.query(`select status, winner_team from public.games where id = $1`, [gameId])).rows).toEqual([
        { status: 'finished', winner_team: 'B' },
      ])
      const { rows } = await tx.query(`select result from public.tournament_matches where id = $1`, [matchId])
      expect(rows[0]).toMatchObject({ result: 'b' })
    })
  })

  it('lets the organizer edit a result without a reason, missing points counting as 0', async () => {
    await inTx(db, async (tx) => {
      const { matchId } = await tournamentTable(tx)
      await actAs(tx, club.players[0])
      await tx.query(`select public.edit_match_result($1, 'a', 1500, null, null)`, [matchId])
      await tx.exec('reset role')
      const { rows } = await tx.query(`select result, points_a, points_b, edited_reason from public.tournament_matches where id = $1`, [
        matchId,
      ])
      expect(rows).toEqual([{ result: 'a', points_a: 1500, points_b: 0, edited_reason: null }])
    })
  })
})
