import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { PIN, type PinResult, rpc } from './fixtures'
import { actAs, asUser, asUserCommit, createDb, createUser, inTx } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

const freshUser = async (): Promise<string> => createUser(db, 'Pin user')

describe('set_pin / has_pin', () => {
  it('stores a bcrypt hash the client cannot read', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      expect(await rpc(tx, 'public.has_pin()')).toBe(false)
      await tx.query(`select public.set_pin($1)`, [PIN])
      expect(await rpc(tx, 'public.has_pin()')).toBe(true)
      await tx.exec('reset role')
      const { rows } = await tx.query<{ pin_hash: string }>(`select pin_hash from public.pins where user_id = $1`, [user])
      expect(rows[0]?.pin_hash).toMatch(/^\$2[ab]\$08\$/)
      expect(rows[0]?.pin_hash).not.toContain(PIN)
      await actAs(tx, user)
      await expect(tx.query(`select * from public.pins`)).rejects.toThrow(/permission denied/)
    })
  })

  it.each(['123', '12345', 'abcd', '12 4', ''])('rejects the malformed PIN %j', async (pin) => {
    const user = await freshUser()
    await expect(asUser(db, user, (tx) => tx.query(`select public.set_pin($1)`, [pin]))).rejects.toThrow(/4 digits/)
  })

  it('refuses to overwrite an existing PIN', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      await expect(tx.query(`select public.set_pin('9999')`)).rejects.toThrow(/already set/)
    })
  })
})

describe('verification and lockout', () => {
  it('reports no_pin before one is set', async () => {
    const user = await freshUser()
    await asUser(db, user, async (tx) => {
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', [PIN])).toEqual({ ok: false, error: 'no_pin' })
    })
  })

  it('counts down attempts and locks for 15 minutes after the 5th wrong PIN', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      for (const left of [4, 3, 2, 1]) {
        expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', ['0000'])).toEqual({
          ok: false,
          error: 'wrong_pin',
          attempts_left: left,
        })
      }
      const locked = await rpc<PinResult>(tx, 'public.check_my_pin($1)', ['0000'])
      expect(locked).toMatchObject({ ok: false, error: 'locked' })
      const minutes = (new Date(locked.locked_until!).getTime() - Date.now()) / 60_000
      expect(minutes).toBeGreaterThan(14)
      expect(minutes).toBeLessThanOrEqual(15.1)
      // Even the right PIN is refused while locked.
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', [PIN])).toMatchObject({ ok: false, error: 'locked' })
    })
  })

  it('keeps the failed-attempt count even though the RPC reports failure', async () => {
    const user = await freshUser()
    // Each call commits on its own, exactly like separate API requests.
    await asUserCommit(db, user, (tx) => tx.query(`select public.set_pin($1)`, [PIN]))
    await asUserCommit(db, user, (tx) => tx.query(`select public.check_my_pin('0000')`))
    await asUserCommit(db, user, (tx) => tx.query(`select public.check_my_pin('0000')`))
    const { rows } = await db.query<{ failed_attempts: number }>(`select failed_attempts from public.pins where user_id = $1`, [user])
    expect(rows[0]?.failed_attempts).toBe(2)
  })

  it('resets the counter after a correct PIN', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      await rpc(tx, 'public.check_my_pin($1)', ['0000'])
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', [PIN])).toEqual({ ok: true })
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', ['0000'])).toMatchObject({ attempts_left: 4 })
    })
  })

  it('unlocks after the lockout window passes', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      await tx.exec('reset role')
      await tx.query(`update public.pins set locked_until = now() - interval '1 second' where user_id = $1`, [user])
      await actAs(tx, user)
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', [PIN])).toEqual({ ok: true })
    })
  })
})

describe('change_pin / reset_pin', () => {
  it('changes the PIN only with the old one', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      expect(await rpc<PinResult>(tx, 'public.change_pin($1, $2)', ['9999', '5678'])).toMatchObject({ ok: false, error: 'wrong_pin' })
      expect(await rpc<PinResult>(tx, 'public.change_pin($1, $2)', [PIN, '5678'])).toEqual({ ok: true })
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', ['5678'])).toEqual({ ok: true })
    })
  })

  it('resets a forgotten PIN only right after signing in again, clearing a lockout', async () => {
    const user = await freshUser()
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      await expect(tx.query(`select public.reset_pin('5678')`)).rejects.toThrow(/sign in again/)
    })
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.set_pin($1)`, [PIN])
      for (let i = 0; i < 5; i++) await rpc(tx, 'public.check_my_pin($1)', ['0000'])
      await actAs(tx, user, 30)
      await tx.query(`select public.reset_pin('5678')`)
      expect(await rpc<PinResult>(tx, 'public.check_my_pin($1)', ['5678'])).toEqual({ ok: true })
    })
  })

  it('does not expose verify_pin for checking someone else’s PIN', async () => {
    const user = await freshUser()
    const victim = await freshUser()
    await expect(asUser(db, user, (tx) => tx.query(`select public.verify_pin($1, '1234')`, [victim]))).rejects.toThrow(/permission denied/)
  })
})
