import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { seedClub } from './fixtures'
import { actAs, asUser, createDb, createUser, inTx } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

const roleOf = async (clubId: string, userId: string): Promise<string | undefined> => {
  const { rows } = await db.query<{ role: string }>(`select role from public.club_members where club_id = $1 and user_id = $2`, [
    clubId,
    userId,
  ])
  return rows[0]?.role
}

describe('joining', () => {
  it('joins by invite code regardless of case and whitespace, idempotently', async () => {
    const c = await seedClub(db, 'Join')
    const newcomer = await createUser(db, 'New')
    const { rows } = await db.query<{ invite_code: string }>(`select invite_code from public.clubs where id = $1`, [c.clubId])
    await inTx(db, async (tx) => {
      await actAs(tx, newcomer)
      const code = ` ${rows[0]!.invite_code.toLowerCase()} `
      await tx.query(`select public.join_club($1)`, [code])
      await tx.query(`select public.join_club($1)`, [code])
      expect((await tx.query(`select 1 from public.clubs where id = $1`, [c.clubId])).rows).toHaveLength(1)
    })
  })

  it('rejects an unknown code', async () => {
    const user = await createUser(db, 'Lost')
    // null (not an error) so the failed attempt is recorded for throttling
    const joined = await asUser(
      db,
      user,
      async (tx) => (await tx.query<{ c: string | null }>(`select public.join_club('ZZZZZZ') as c`)).rows[0]!.c,
    )
    expect(joined).toBeNull()
  })

  it('stops working after the owner rotates the code', async () => {
    const c = await seedClub(db, 'Rotate')
    const late = await createUser(db, 'Late')
    const { rows } = await db.query<{ invite_code: string }>(`select invite_code from public.clubs where id = $1`, [c.clubId])
    const oldCode = rows[0]!.invite_code
    await inTx(db, async (tx) => {
      await actAs(tx, c.players[1])
      await expect(tx.query(`select public.rotate_invite_code($1)`, [c.clubId])).rejects.toThrow(/only the club owner/)
    })
    await inTx(db, async (tx) => {
      await actAs(tx, c.players[0])
      const fresh = (await tx.query<{ c: string }>(`select public.rotate_invite_code($1) as c`, [c.clubId])).rows[0]!.c
      expect(fresh).not.toBe(oldCode)
      await actAs(tx, late)
      expect((await tx.query<{ c: string | null }>(`select public.join_club($1) as c`, [oldCode])).rows[0]!.c).toBeNull()
    })
  })
})

describe('roles', () => {
  it('lets the owner promote admins, and admins remove plain members only', async () => {
    const c = await seedClub(db, 'Roles')
    const [owner, admin, member, other] = c.players
    await db.transaction(async (tx) => {
      await actAs(tx, owner)
      await tx.query(`select public.set_member_role($1, $2, 'admin')`, [c.clubId, admin])
    })
    expect(await roleOf(c.clubId, admin)).toBe('admin')
    await inTx(db, async (tx) => {
      await actAs(tx, admin)
      await tx.query(`select public.remove_member($1, $2)`, [c.clubId, member])
      await expect(tx.query(`select public.remove_member($1, $2)`, [c.clubId, owner])).rejects.toThrow(/not allowed/)
    })
    await inTx(db, async (tx) => {
      await actAs(tx, other)
      await expect(tx.query(`select public.remove_member($1, $2)`, [c.clubId, member])).rejects.toThrow(/not allowed/)
    })
  })

  it('refuses to make someone owner through set_member_role', async () => {
    const c = await seedClub(db, 'NoOwner')
    await expect(
      asUser(db, c.players[0], (tx) => tx.query(`select public.set_member_role($1, $2, 'owner')`, [c.clubId, c.players[1]])),
    ).rejects.toThrow(/transfer_ownership/)
  })

  it('transfers ownership, demoting the old owner to admin', async () => {
    const c = await seedClub(db, 'Transfer')
    await db.transaction(async (tx) => {
      await actAs(tx, c.players[0])
      await tx.query(`select public.transfer_ownership($1, $2)`, [c.clubId, c.players[1]])
    })
    expect(await roleOf(c.clubId, c.players[1])).toBe('owner')
    expect(await roleOf(c.clubId, c.players[0])).toBe('admin')
    const { rows } = await db.query<{ owner_id: string }>(`select owner_id from public.clubs where id = $1`, [c.clubId])
    expect(rows[0]?.owner_id).toBe(c.players[1])
  })

  it('does not let members insert themselves into other clubs', async () => {
    const c = await seedClub(db, 'Closed')
    const intruder = await createUser(db, 'Intruder')
    await expect(
      asUser(db, intruder, (tx) => tx.query(`insert into public.club_members (club_id, user_id) values ($1, $2)`, [c.clubId, intruder])),
    ).rejects.toThrow(/row-level security|permission denied/)
  })
})

describe('profiles and devices', () => {
  it('lets users edit their own profile fields but not their id', async () => {
    const user = await createUser(db, 'Me')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`update public.profiles set display_name = 'Renamed', lang = 'ar' where id = $1`, [user])
      const { rows } = await tx.query(`select display_name, lang from public.profiles where id = $1`, [user])
      expect(rows[0]).toEqual({ display_name: 'Renamed', lang: 'ar' })
      await expect(tx.query(`update public.profiles set id = gen_random_uuid() where id = $1`, [user])).rejects.toThrow(/permission denied/)
    })
  })

  it('registers a push token, moving it between accounts on the same phone', async () => {
    const a = await createUser(db, 'Phone A')
    const b = await createUser(db, 'Phone B')
    const token = 'ExponentPushToken[abc123]'
    await inTx(db, async (tx) => {
      await actAs(tx, a)
      await tx.query(`select public.register_device($1, 'ios')`, [token])
      await actAs(tx, b)
      await tx.query(`select public.register_device($1, 'ios')`, [token])
      expect((await tx.query(`select user_id from public.devices`)).rows).toEqual([{ user_id: b }])
      await actAs(tx, a)
      expect((await tx.query(`select 1 from public.devices`)).rows).toHaveLength(0)
    })
  })

  it('rejects junk push tokens', async () => {
    const a = await createUser(db, 'Junk')
    await expect(asUser(db, a, (tx) => tx.query(`select public.register_device('not-a-token', 'ios')`))).rejects.toThrow(
      /invalid push token/,
    )
  })
})
