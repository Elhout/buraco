import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Own', 1)
  // players[1] is an admin; players[2], players[3] and others[0] are plain members.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.players[1]])
}, 120_000)

const owner = () => club.players[0]
const admin = () => club.players[1]
const member = () => club.players[2]

/** A start-now game with the four club players, created by the owner. */
const startGame = (tx: Transaction) =>
  rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])

/** Owner plays one round (A 2000, B 100) and confirms the result: team A wins. */
const finishedGame = async (tx: Transaction): Promise<{ gameId: string; roundId: string }> => {
  await actAs(tx, owner())
  const gameId = await startGame(tx)
  const roundId = await rpc<string>(tx, 'public.submit_round($1, 2000, 100)', [gameId])
  await rpc(tx, 'public.confirm_round($1)', [roundId])
  await rpc(tx, 'public.confirm_result($1)', [gameId])
  return { gameId, roundId }
}

const game = async (tx: Transaction, id: string) =>
  (await tx.query<{ status: string; winner_team: string | null }>(`select status, winner_team from public.games where id = $1`, [id]))
    .rows[0]

const totals = async (tx: Transaction, id: string) =>
  (
    await tx.query<{ a: number; b: number }>(`select team_a_total as a, team_b_total as b from public.v_game_totals where game_id = $1`, [
      id,
    ])
  ).rows[0]

describe('delete_game (owner only)', () => {
  it('removes a finished game from history and stats', async () => {
    await inTx(db, async (tx) => {
      const { gameId } = await finishedGame(tx)
      expect((await tx.query(`select 1 from public.v_player_games where game_id = $1`, [gameId])).rows.length).toBeGreaterThan(0)
      await rpc(tx, 'public.delete_game($1)', [gameId])
      expect((await tx.query(`select 1 from public.games where id = $1`, [gameId])).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.v_game_history where game_id = $1`, [gameId])).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.v_player_games where game_id = $1`, [gameId])).rows).toHaveLength(0)
      const { rows } = await tx.query<{ games: number }>(`select games from public.v_player_stats where club_id = $1 and user_id = $2`, [
        club.clubId,
        owner(),
      ])
      expect(rows.length === 0 || Number(rows[0]!.games) === 0).toBe(true)
      await tx.exec('reset role')
      expect((await tx.query(`select 1 from public.rounds where game_id = $1`, [gameId])).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.game_events where game_id = $1`, [gameId])).rows).toHaveLength(0)
    })
  })

  it('deletes a live game too, freeing its players', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      const gameId = await startGame(tx)
      await rpc<string>(tx, 'public.submit_round($1, 300, 200)', [gameId])
      await rpc(tx, 'public.delete_game($1)', [gameId])
      expect((await tx.query(`select 1 from public.games where id = $1`, [gameId])).rows).toHaveLength(0)
      // The same four can sit down again straight away.
      expect(await startGame(tx)).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  it('refuses admins and members', async () => {
    await inTx(db, async (tx) => {
      const { gameId } = await finishedGame(tx)
      for (const who of [admin(), member()]) {
        await actAs(tx, who)
        await rejects(tx, () => rpc(tx, 'public.delete_game($1)', [gameId]), /only the owner can do this/)
      }
    })
  })

  it('refuses tournament games (they feed the standings)', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      const tid = await rpc<string>(tx, `public.create_tournament($1, 'Cup', 'swiss', 'rotating')`, [club.clubId])
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(club.players.map((u) => ({ user_id: u })))])
      await tx.query(`select public.start_tournament($1)`, [tid])
      await tx.exec('reset role')
      const ids = (
        await tx.query<{ id: string }>(`select id from public.tournament_entries where tournament_id = $1 order by id`, [tid])
      ).rows.map((r) => r.id)
      await actAs(tx, owner())
      await tx.query(`select public.start_round($1, $2::jsonb)`, [
        tid,
        JSON.stringify([{ table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2) }]),
      ])
      await tx.exec('reset role')
      const matchGame = (await tx.query<{ id: string }>(`select id from public.games where tournament_match_id is not null limit 1`))
        .rows[0]!.id
      await actAs(tx, owner())
      await rejects(tx, () => rpc(tx, 'public.delete_game($1)', [matchGame]), /tournament games cannot be deleted/)
    })
  })

  it('cannot be called by anonymous users', async () => {
    await inTx(db, async (tx) => {
      const { gameId } = await finishedGame(tx)
      await actAs(tx, null)
      await rejects(tx, () => rpc(tx, 'public.delete_game($1)', [gameId]), /permission denied/)
    })
  })
})

describe('edit_round_scores (owner only)', () => {
  it('changes the totals and flips the winner of a finished game, with an audit event', async () => {
    await inTx(db, async (tx) => {
      const { gameId, roundId } = await finishedGame(tx)
      expect((await game(tx, gameId))?.winner_team).toBe('A')
      await rpc(tx, 'public.edit_round_scores($1, 100, 2000)', [roundId])
      expect(await totals(tx, gameId)).toEqual({ a: 100, b: 2000 })
      expect(await game(tx, gameId)).toEqual({ status: 'finished', winner_team: 'B' })
      const { rows } = await tx.query<{ type: string; actor_id: string; payload: Record<string, unknown> }>(
        `select type, actor_id, payload from public.game_events where game_id = $1 and type = 'round_edited'`,
        [gameId],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.actor_id).toBe(owner())
      expect(rows[0]!.payload).toMatchObject({ round_no: 1, old_a: 2000, old_b: 100, new_a: 100, new_b: 2000 })
    })
  })

  it('edits a confirmed round of a live game without finishing it', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      const gameId = await startGame(tx)
      const roundId = await rpc<string>(tx, 'public.submit_round($1, 300, 200)', [gameId])
      await rpc(tx, 'public.confirm_round($1)', [roundId])
      await rpc(tx, 'public.edit_round_scores($1, 350, 150)', [roundId])
      expect(await totals(tx, gameId)).toEqual({ a: 350, b: 150 })
      expect((await game(tx, gameId))?.status).toBe('live')
    })
  })

  it('refuses an edit that would make a finished game a tie', async () => {
    await inTx(db, async (tx) => {
      const { roundId } = await finishedGame(tx)
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 500, 500)', [roundId]), /would make the game a tie/)
    })
  })

  it('only edits confirmed rounds', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      const gameId = await startGame(tx)
      // Start-now rounds are confirmed on entry; a tapped exact cut opens the deal's round before that.
      await rpc(tx, 'public.add_cut($1, 1::smallint)', [gameId])
      const open = (await tx.query<{ id: string }>(`select id from public.rounds where game_id = $1 and status = 'open'`, [gameId]))
        .rows[0]!.id
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 1, 2)', [open]), /only confirmed rounds can be edited/)
    })
  })

  it('applies the game rules: bounds, and no negatives when the snapshot forbids them', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      await tx.query(`update public.clubs set allow_negative = false where id = $1`, [club.clubId])
      const gameId = await startGame(tx)
      const roundId = await rpc<string>(tx, 'public.submit_round($1, 300, 200)', [gameId])
      await rpc(tx, 'public.confirm_round($1)', [roundId])
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, -50, 200)', [roundId]), /negative round scores are not allowed/)
      await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 100000, 200)', [roundId]), /out of range/)
    })
  })

  it('refuses admins and members', async () => {
    await inTx(db, async (tx) => {
      const { roundId } = await finishedGame(tx)
      for (const who of [admin(), member()]) {
        await actAs(tx, who)
        await rejects(tx, () => rpc(tx, 'public.edit_round_scores($1, 100, 2000)', [roundId]), /only the owner can do this/)
      }
    })
  })

  it('keeps finished games frozen for everything else', async () => {
    await inTx(db, async (tx) => {
      const { gameId } = await finishedGame(tx)
      await tx.exec('reset role')
      await rejects(tx, () => tx.query(`update public.games set winner_team = 'B' where id = $1`, [gameId]), /frozen/)
    })
  })
})
