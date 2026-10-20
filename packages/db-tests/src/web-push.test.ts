import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Web', 0)
}, 120_000)

const ENDPOINT = 'https://web.push.apple.com/QGkVxYz123'
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
const AUTH = 'tBHItJI5svbpez7KI4CCXg'

interface Claimed {
  id: string
  tokens: string[]
  web: { endpoint: string; p256dh: string; auth: string }[]
}

const queue = async (tx: Transaction, userId: string, gameId: string | null = null): Promise<void> => {
  await tx.exec('reset role')
  await tx.query(`delete from public.notification_queue`)
  await tx.query(
    `insert into public.notification_queue (user_id, event, deep_link, game_id) values ($1, 'ghost_verify', '/history/x', $2)`,
    [userId, gameId],
  )
}

const claim = (tx: Transaction): Promise<Claimed[]> => asService(tx, () => rpc<Claimed[]>(tx, 'public.claim_notifications(10)'))

describe('register_web_push', () => {
  it('stores a web device keyed by its endpoint, separate from Expo tokens', async () => {
    const user = await createUser(db, 'Safari')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH])
      await tx.query(`select public.register_device('ExponentPushToken[phone]', 'android')`)
      const { rows } = await tx.query(`select platform, expo_push_token, web_p256dh, web_auth from public.devices order by platform`)
      expect(rows).toEqual([
        { platform: 'android', expo_push_token: 'ExponentPushToken[phone]', web_p256dh: null, web_auth: null },
        { platform: 'web', expo_push_token: ENDPOINT, web_p256dh: P256DH, web_auth: AUTH },
      ])

      await queue(tx, user)
      const [row] = await claim(tx)
      expect(row!.tokens).toEqual(['ExponentPushToken[phone]'])
      expect(row!.web).toEqual([{ endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH }])
    })
  })

  it('moves an endpoint to the user who registers it last, with fresh keys', async () => {
    const first = await createUser(db, 'First')
    const second = await createUser(db, 'Second')
    await inTx(db, async (tx) => {
      await actAs(tx, first)
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH])
      await actAs(tx, second)
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, 'bmV3LWF1dGgtc2VjcmV0'])
      await tx.exec('reset role')
      const { rows } = await tx.query(`select user_id, web_auth from public.devices where expo_push_token = $1`, [ENDPOINT])
      expect(rows).toEqual([{ user_id: second, web_auth: 'bmV3LWF1dGgtc2VjcmV0' }])
    })
  })

  it.each([
    ['http://insecure.example/push', P256DH, AUTH],
    [`https://x.example/${'a'.repeat(1000)}`, P256DH, AUTH],
    [ENDPOINT, 'short', AUTH],
    [ENDPOINT, P256DH, 'not base64!'],
    [ENDPOINT, P256DH, null],
  ])('rejects a bad subscription (%#)', async (endpoint, p256dh, auth) => {
    const user = await createUser(db, 'Bad')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await rejects(
        tx,
        () => tx.query(`select public.register_web_push($1, $2, $3)`, [endpoint, p256dh, auth]),
        /invalid web push subscription/,
      )
    })
  })

  it('needs a signed-in user', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, null)
      await rejects(tx, () => tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH]), /permission denied/)
    })
  })

  it('keeps at most 10 devices per user, web included', async () => {
    const user = await createUser(db, 'Many')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      for (let i = 0; i < 12; i++) await tx.query(`select public.register_web_push($1, $2, $3)`, [`${ENDPOINT}-${i}`, P256DH, AUTH])
      expect((await tx.query(`select 1 from public.devices`)).rows).toHaveLength(10)
    })
  })
})

describe('web devices share the device lifecycle', () => {
  it('set_device_state with the endpoint suppresses pushes about the open game', async () => {
    await inTx(db, async (tx) => {
      const host = club.players[0]!
      await actAs(tx, host)
      const gameId = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH])
      await tx.query(`select public.set_device_state($1, 'active', $2)`, [ENDPOINT, gameId])

      await queue(tx, host, gameId)
      expect((await claim(tx))[0]!.web).toEqual([])

      await actAs(tx, host)
      await tx.query(`select public.set_device_state($1, 'background', $2)`, [ENDPOINT, gameId])
      await queue(tx, host, gameId)
      expect((await claim(tx))[0]!.web).toHaveLength(1)
    })
  })

  it('unregister_device removes a web device by endpoint', async () => {
    const user = await createUser(db, 'Leaver')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH])
      await tx.query(`select public.unregister_device($1)`, [ENDPOINT])
      expect((await tx.query(`select 1 from public.devices`)).rows).toHaveLength(0)
    })
  })

  it('finish_notifications deletes dead endpoints', async () => {
    const user = await createUser(db, 'Gone')
    await inTx(db, async (tx) => {
      await actAs(tx, user)
      await tx.query(`select public.register_web_push($1, $2, $3)`, [ENDPOINT, P256DH, AUTH])
      await queue(tx, user)
      const [row] = await claim(tx)
      await asService(tx, () =>
        tx.query(`select public.finish_notifications($1::jsonb, $2)`, [
          JSON.stringify([{ id: row!.id, status: 'failed', error: 'gone' }]),
          [ENDPOINT],
        ]),
      )
      await tx.exec('reset role')
      expect((await tx.query(`select 1 from public.devices where user_id = $1`, [user])).rows).toHaveLength(0)
    })
  })
})
