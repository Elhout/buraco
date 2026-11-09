import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let outsider: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'React', 1)
  outsider = await createUser(db, 'Stranger')
}, 120_000)

/** A game with one comment by players[0]; returns the comment id. */
const comment = async (tx: Transaction): Promise<string> => {
  await actAs(tx, club.players[0])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  return rpc<string>(tx, 'public.add_game_comment($1, $2)', [id, 'Great cut!'])
}

const reactions = async (tx: Transaction, commentId: string) =>
  (
    await tx.query<{ user_id: string; emoji: string }>(
      `select user_id, emoji from public.comment_reactions where comment_id = $1 order by created_at, emoji`,
      [commentId],
    )
  ).rows

describe('comment reactions', () => {
  it('any club member reacts; tapping the same emoji again takes it back', async () => {
    await inTx(db, async (tx) => {
      const c = await comment(tx)
      await actAs(tx, club.others[0]!)
      expect(await rpc<boolean>(tx, `public.toggle_comment_reaction($1, '❤️')`, [c])).toBe(true)
      await rpc(tx, `public.toggle_comment_reaction($1, '😂')`, [c])
      await actAs(tx, club.players[2])
      await rpc(tx, `public.toggle_comment_reaction($1, '❤️')`, [c])
      expect(await reactions(tx, c)).toHaveLength(3)
      await actAs(tx, club.others[0]!)
      expect(await rpc<boolean>(tx, `public.toggle_comment_reaction($1, '❤️')`, [c])).toBe(false)
      // Same timestamp inside one transaction: compare without order.
      expect(await reactions(tx, c)).toEqual(
        expect.arrayContaining([
          { user_id: club.others[0], emoji: '😂' },
          { user_id: club.players[2], emoji: '❤️' },
        ]),
      )
      expect(await reactions(tx, c)).toHaveLength(2)
    })
  })

  it('only the offered emojis', async () => {
    await inTx(db, async (tx) => {
      const c = await comment(tx)
      await rejects(tx, () => rpc(tx, `public.toggle_comment_reaction($1, '💩')`, [c]), /not an available reaction/)
    })
  })

  it('keeps outsiders out', async () => {
    await inTx(db, async (tx) => {
      const c = await comment(tx)
      await rpc(tx, `public.toggle_comment_reaction($1, '👍')`, [c])
      await actAs(tx, outsider)
      await rejects(tx, () => rpc(tx, `public.toggle_comment_reaction($1, '👍')`, [c]), /not a member/)
      expect(await reactions(tx, c)).toEqual([])
      await rejects(
        tx,
        () =>
          tx.query(
            `insert into public.comment_reactions (comment_id, game_id, user_id, emoji) select id, game_id, $2, '👍' from public.game_comments where id = $1`,
            [c, outsider],
          ),
        /permission denied/,
      )
    })
  })

  it('go away with their comment', async () => {
    await inTx(db, async (tx) => {
      const c = await comment(tx)
      await rpc(tx, `public.toggle_comment_reaction($1, '🔥')`, [c])
      await tx.exec('reset role')
      await tx.query(`delete from public.game_comments where id = $1`, [c])
      expect(await reactions(tx, c)).toEqual([])
    })
  })
})
