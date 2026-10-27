import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, inTx } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Beat')
}, 120_000)

const TOKEN = 'ExpoPushToken[beat]'

/** players[1] has the live game open on TOKEN, last checking in `secondsAgo` ago; players[0] posts a round. */
const roundWhileWatching = async (tx: Transaction, secondsAgo: number): Promise<string[]> => {
  await actAs(tx, club.players[0])
  const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(normalSeats(club))])
  await actAs(tx, club.players[1])
  await rpc(tx, 'public.register_device($1, $2)', [TOKEN, 'ios'])
  await rpc(tx, `public.set_device_state($1, 'active', $2)`, [TOKEN, id])
  await tx.exec('reset role')
  await tx.query(`update public.devices set last_seen = now() - make_interval(secs => $1) where expo_push_token = $2`, [secondsAgo, TOKEN])
  await actAs(tx, club.players[0])
  await rpc(tx, 'public.submit_round($1, 100, 50)', [id])
  const claimed = await asService(tx, () => rpc<{ event: string; tokens: string[] }[]>(tx, 'public.claim_notifications(100)'))
  return claimed.filter((n) => n.event === 'live_score').flatMap((n) => n.tokens)
}

describe('game pushes and a phone that has the game open', () => {
  it('skips a phone that is checking in with the game on screen', async () => {
    await inTx(db, async (tx) => {
      expect(await roundWhileWatching(tx, 10)).not.toContain(TOKEN)
    })
  })

  it('reaches a phone that stopped checking in (locked with the game open)', async () => {
    await inTx(db, async (tx) => {
      expect(await roundWhileWatching(tx, 120)).toContain(TOKEN)
    })
  })
})
