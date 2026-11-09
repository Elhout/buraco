import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let outsider: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Talk', 1)
  outsider = await createUser(db, 'Stranger')
}, 120_000)

// others[0] is a member watching, not seated.
const watcher = () => club.others[0]!

const startGame = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[0])
  return rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
}

const comments = async (tx: Transaction, gameId: string) =>
  (
    await tx.query<{ user_id: string; body: string }>(
      `select user_id, body from public.game_comments where game_id = $1 order by created_at`,
      [gameId],
    )
  ).rows

describe('game comments', () => {
  it('any club member comments on a game, during it and after it ends', async () => {
    await inTx(db, async (tx) => {
      const id = await startGame(tx)
      await actAs(tx, watcher())
      await rpc(tx, 'public.add_game_comment($1, $2)', [id, '  Great cut!  '])
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.submit_round($1, 2100, 0)', [id])
      await rpc(tx, 'public.confirm_result($1)', [id])
      await rpc(tx, 'public.add_game_comment($1, $2)', [id, 'GG'])
      await actAs(tx, club.players[2])
      expect(await comments(tx, id)).toEqual([
        { user_id: watcher(), body: 'Great cut!' },
        { user_id: club.players[0], body: 'GG' },
      ])
    })
  })

  it('refuses empty and over-long comments', async () => {
    await inTx(db, async (tx) => {
      const id = await startGame(tx)
      await rejects(tx, () => rpc(tx, 'public.add_game_comment($1, $2)', [id, '  ']), /comment is empty/)
      await rejects(tx, () => rpc(tx, 'public.add_game_comment($1, $2)', [id, 'x'.repeat(501)]), /comment is too long/)
    })
  })

  it('keeps outsiders out: no posting, no reading, no direct insert', async () => {
    await inTx(db, async (tx) => {
      const id = await startGame(tx)
      await rpc(tx, 'public.add_game_comment($1, $2)', [id, 'members only'])
      await actAs(tx, outsider)
      await rejects(tx, () => rpc(tx, 'public.add_game_comment($1, $2)', [id, 'hi']), /not a member/)
      expect(await comments(tx, id)).toEqual([])
      await rejects(
        tx,
        () => tx.query(`insert into public.game_comments (game_id, user_id, body) values ($1, $2, 'x')`, [id, outsider]),
        /permission denied/,
      )
    })
  })

  it("notifies the game's players and earlier commenters, not the author", async () => {
    await inTx(db, async (tx) => {
      const id = await startGame(tx)
      await actAs(tx, watcher())
      await rpc(tx, 'public.add_game_comment($1, $2)', [id, 'first'])
      await actAs(tx, club.players[1])
      await rpc(tx, 'public.add_game_comment($1, $2)', [id, 'nice'])
      await tx.exec('reset role')
      const { rows } = await tx.query<{ user_id: string; deep_link: string; payload: { sender: string; text: string } }>(
        `select user_id, deep_link, payload from public.notification_queue where event = 'game_comment' and payload ->> 'text' = 'nice'`,
      )
      expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([club.players[0], club.players[2], club.players[3], watcher()]))
      expect(rows[0]).toMatchObject({ deep_link: `/game/${id}`, payload: { sender: 'Talk-Sara', text: 'nice' } })
    })
  })
})
