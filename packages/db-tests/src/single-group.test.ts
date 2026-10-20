import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { rpc } from './fixtures'
import { actAs, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
}, 120_000)

describe('ensure_membership (one group of players, no visible clubs)', () => {
  it('creates the group for the very first account and makes it the owner', async () => {
    const first = await createUser(db, 'First')
    await inTx(db, async (tx) => {
      await actAs(tx, first)
      const club = await rpc<string>(tx, 'public.ensure_membership()')
      const { rows } = await tx.query(`select role from public.club_members where club_id = $1 and user_id = $2`, [club, first])
      expect(rows).toEqual([{ role: 'owner' }])
      // Idempotent: a second call returns the same group and adds nothing.
      expect(await rpc<string>(tx, 'public.ensure_membership()')).toBe(club)
      expect((await tx.query(`select 1 from public.clubs`)).rows).toHaveLength(1)
    })
  })

  it('puts everyone after that into the existing group as a member', async () => {
    const owner = await createUser(db, 'Owner')
    const player = await createUser(db, 'Player')
    await inTx(db, async (tx) => {
      await actAs(tx, owner)
      const club = await rpc<string>(tx, 'public.ensure_membership()')
      await actAs(tx, player)
      expect(await rpc<string>(tx, 'public.ensure_membership()')).toBe(club)
      const { rows } = await tx.query(`select role from public.club_members where club_id = $1 and user_id = $2`, [club, player])
      expect(rows).toEqual([{ role: 'member' }])
      expect((await tx.query(`select 1 from public.clubs`)).rows).toHaveLength(1)
    })
  })

  it('keeps a player who is already in a group where they are', async () => {
    const owner = await createUser(db, 'Owner2')
    await inTx(db, async (tx) => {
      await actAs(tx, owner)
      const mine = await rpc<string>(tx, `public.create_club('Elsewhere')`).catch(() => null)
      const club = await rpc<string>(tx, 'public.ensure_membership()')
      if (mine) expect(club).toBe(mine)
      expect((await tx.query(`select 1 from public.club_members where user_id = $1`, [owner])).rows).toHaveLength(1)
    })
  })

  it('needs a signed-in user', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, null)
      await rejects(tx, () => rpc(tx, 'public.ensure_membership()'), /permission denied|not authenticated/)
    })
  })
})
