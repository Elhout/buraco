import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let outsider: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Names', 1)
  // others[0] is an admin.
  await db.query(`update public.club_members set role = 'admin' where club_id = $1 and user_id = $2`, [club.clubId, club.others[0]])
  outsider = await createUser(db, 'Elsewhere')
}, 120_000)

const owner = () => club.players[0]
const admin = () => club.others[0]!
const member = () => club.players[2]

const nameOf = async (tx: Parameters<Parameters<typeof inTx>[1]>[0], id: string) => {
  await tx.exec('reset role')
  return (await tx.query<{ n: string }>(`select display_name as n from public.profiles where id = $1`, [id])).rows[0]?.n
}

describe('only the owner changes names', () => {
  it('players can no longer rename themselves', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, member())
      await rejects(tx, () => tx.query(`update public.profiles set display_name = 'Me' where id = $1`, [member()]), /permission denied/)
    })
  })

  it('players still change their own language and notification choices', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, member())
      await tx.query(`update public.profiles set lang = 'ar', notify_game_started = false where id = $1`, [member()])
    })
  })

  it('the owner renames a member (trimmed, spaces collapsed)', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      await rpc(tx, 'public.set_member_name($1, $2, $3)', [club.clubId, member(), '  Abu   Ali '])
      expect(await nameOf(tx, member())).toBe('Abu Ali')
    })
  })

  it('refuses admins and plain members', async () => {
    await inTx(db, async (tx) => {
      for (const who of [admin(), member()]) {
        await actAs(tx, who)
        await rejects(tx, () => rpc(tx, 'public.set_member_name($1, $2, $3)', [club.clubId, club.players[3], 'X']), /only the club owner/)
      }
    })
  })

  it('only renames members of the club, with a valid name', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      await rejects(tx, () => rpc(tx, 'public.set_member_name($1, $2, $3)', [club.clubId, outsider, 'X']), /not a member/)
      await rejects(tx, () => rpc(tx, 'public.set_member_name($1, $2, $3)', [club.clubId, member(), '   ']), /1 to 40 characters/)
      await rejects(tx, () => rpc(tx, 'public.set_member_name($1, $2, $3)', [club.clubId, member(), 'x'.repeat(41)]), /1 to 40 characters/)
    })
  })
})

describe('assert_club_owner (manage-accounts set_username)', () => {
  it('passes for the owner and a member target only', async () => {
    await inTx(db, async (tx) => {
      const ok = (caller: string, target: string) =>
        asService(tx, () => rpc<boolean>(tx, 'public.is_club_owner_for($1, $2, $3)', [caller, club.clubId, target]))
      expect(await ok(owner(), member())).toBe(true)
      expect(await ok(admin(), member())).toBe(false)
      expect(await ok(owner(), outsider)).toBe(false)
    })
  })

  it('is not callable by signed-in users', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, owner())
      await rejects(tx, () => rpc(tx, 'public.is_club_owner_for($1, $2, $3)', [owner(), club.clubId, member()]), /permission denied/)
    })
  })
})
