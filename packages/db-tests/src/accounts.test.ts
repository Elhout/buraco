import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Acct', 1)
}, 120_000)

/** players[0] owns the club; players[1] is made admin; the rest are members. */
const withAdmin = async (tx: Transaction): Promise<void> => {
  await tx.exec('reset role')
  await tx.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.players[1]])
}

const canManage = (tx: Transaction, caller: string, target: string | null): Promise<boolean> =>
  asService(tx, () => rpc<boolean>(tx, 'public.can_manage_account($1, $2, $3)', [caller, club.clubId, target]))

describe('can_manage_account', () => {
  it('lets the owner manage anyone in the club, admins included', async () => {
    await inTx(db, async (tx) => {
      await withAdmin(tx)
      const [owner, admin, member] = club.players
      expect(await canManage(tx, owner, null)).toBe(true)
      expect(await canManage(tx, owner, admin)).toBe(true)
      expect(await canManage(tx, owner, member)).toBe(true)
      expect(await canManage(tx, owner, owner)).toBe(true)
    })
  })

  it('lets an admin manage members only, never the owner or another admin', async () => {
    await inTx(db, async (tx) => {
      await withAdmin(tx)
      const [owner, admin, member, other] = club.players
      await tx.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, other])
      expect(await canManage(tx, admin, null)).toBe(true)
      expect(await canManage(tx, admin, member)).toBe(true)
      expect(await canManage(tx, admin, admin)).toBe(true)
      expect(await canManage(tx, admin, owner)).toBe(false)
      expect(await canManage(tx, admin, other)).toBe(false)
    })
  })

  it('refuses plain members, outsiders and cross-club takeovers', async () => {
    const outsider = await createUser(db, 'Outsider')
    await inTx(db, async (tx) => {
      await withAdmin(tx)
      const [owner, admin, member] = club.players
      expect(await canManage(tx, member, null)).toBe(false)
      expect(await canManage(tx, member, club.players[3])).toBe(false)
      expect(await canManage(tx, owner, outsider)).toBe(false)

      // The member owns a club of their own: an admin here must not take that account over.
      const extra = club.others[0]!
      await actAs(tx, extra)
      await tx.query(`select public.create_club('Side table')`)
      await tx.exec('reset role')
      expect(await canManage(tx, admin, extra)).toBe(false)
      // The owner of this club is not the owner there either.
      expect(await canManage(tx, owner, extra)).toBe(false)
      expect(await canManage(tx, admin, member)).toBe(true)
    })
  })
})

describe('assert_account_admin / add_account_to_club', () => {
  it('raises when the caller may not manage the account', async () => {
    await inTx(db, async (tx) => {
      await asService(tx, () => tx.query(`select public.assert_account_admin($1, $2, $3)`, [club.players[0], club.clubId, club.players[2]]))
      await tx.exec('set local role service_role')
      await rejects(
        tx,
        () => tx.query(`select public.assert_account_admin($1, $2)`, [club.players[2], club.clubId]),
        /not allowed to manage this account/,
      )
    })
  })

  it('adds a new account to the club as a member, idempotently', async () => {
    const fresh = await createUser(db, 'Fresh', 'fresh')
    await inTx(db, async (tx) => {
      await asService(tx, async () => {
        await tx.query(`select public.add_account_to_club($1, $2, $3)`, [club.players[0], club.clubId, fresh])
        await tx.query(`select public.add_account_to_club($1, $2, $3)`, [club.players[0], club.clubId, fresh])
      })
      const { rows } = await tx.query(`select role from public.club_members where club_id = $1 and user_id = $2`, [club.clubId, fresh])
      expect(rows).toEqual([{ role: 'member' }])
    })
  })

  it('refuses a caller who is not an owner or admin', async () => {
    const fresh = await createUser(db, 'Fresh2')
    await inTx(db, async (tx) => {
      await tx.exec('set local role service_role')
      await rejects(
        tx,
        () => tx.query(`select public.add_account_to_club($1, $2, $3)`, [club.players[3], club.clubId, fresh]),
        /not allowed to manage this account/,
      )
    })
  })

  it('cannot be called from the app', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await inTx(db, async (tx) => {
        await actAs(tx, role === 'anon' ? null : club.players[0])
        for (const sql of [
          'public.can_manage_account($1, $2, null)',
          'public.assert_account_admin($1, $2)',
          'public.add_account_to_club($1, $2, $1)',
        ]) {
          await rejects(tx, () => tx.query(`select ${sql}`, [club.players[0], club.clubId]), /permission denied/)
        }
      })
    }
  })
})

describe('club_accounts', () => {
  it('lists members with their usernames and what the caller can do', async () => {
    const named = await createUser(db, 'Named Player', 'named.player')
    await inTx(db, async (tx) => {
      await withAdmin(tx)
      await asService(tx, () => tx.query(`select public.add_account_to_club($1, $2, $3)`, [club.players[0], club.clubId, named]))
      await actAs(tx, club.players[1])
      const { rows } = await tx.query<{
        user_id: string
        display_name: string
        role: string
        username: string | null
        can_manage: boolean
      }>(`select * from public.club_accounts($1)`, [club.clubId])
      const byId = new Map(rows.map((r) => [r.user_id, r]))
      expect(byId.get(named)).toEqual({
        user_id: named,
        display_name: 'Named Player',
        role: 'member',
        username: 'named.player',
        can_manage: true,
      })
      expect(byId.get(club.players[0])).toMatchObject({ role: 'owner', username: null, can_manage: false })
      expect(rows.map((r) => r.display_name)).toEqual([...rows.map((r) => r.display_name)].sort())
    })
  })

  it('is for owners and admins only', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[3])
      await rejects(
        tx,
        () => tx.query(`select * from public.club_accounts($1)`, [club.clubId]),
        /only club owners and admins can manage accounts/,
      )
    })
  })
})
