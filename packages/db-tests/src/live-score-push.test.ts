import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, PIN, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, createDb, inTx } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Live')
}, 120_000)

type Tx = Parameters<Parameters<typeof inTx>[1]>[0]

const liveScores = async (tx: Tx, gameId: string) => {
  const { rows } = await tx.query<{ user_id: string; deep_link: string; payload: Record<string, unknown> }>(
    `select user_id, deep_link, payload from public.notification_queue
     where game_id = $1 and event = 'live_score' order by created_at, user_id`,
    [gameId],
  )
  return rows
}

describe('live score push (lock-screen score after every counted round)', () => {
  it('queues the running score for every real player when a round counts', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const seats = normalSeats(club).map((s) => (s.seat === 4 ? { seat: 4, team: 'B' as const, guest_name: 'Guest' } : s))
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, JSON.stringify(seats)])
      await rpc(tx, 'public.submit_round($1, 120, 60)', [id])
      await rpc(tx, 'public.submit_round($1, 200, -40)', [id])
      await tx.exec('reset role')

      const rows = await liveScores(tx, id)
      // Three members (the guest has no phone), two rounds.
      expect(rows).toHaveLength(6)
      expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set(club.players.slice(0, 3)))
      expect(rows.every((r) => r.deep_link === `/game/${id}`)).toBe(true)
      const last = rows[rows.length - 1]!.payload
      expect(last).toMatchObject({ round_no: 2, a: 320, b: 20 })
      expect(last.team_a).toEqual(['Live-Omar', 'Live-Sara'])
      expect(last.team_b).toEqual(['Live-Ahmed', 'Guest'])
    })
  })

  it('waits until a round is confirmed in a normal game', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
      for (const who of [2, 1, 3]) {
        await actAs(tx, club.players[who]!)
        await rpc(tx, 'public.respond_invite($1, true, $2)', [id, PIN])
      }
      await actAs(tx, club.players[0])
      const round = await rpc<string>(tx, 'public.submit_round($1, 300, 100)', [id])
      await tx.exec('reset role')
      expect(await liveScores(tx, id)).toHaveLength(0)

      await actAs(tx, club.players[2])
      await rpc(tx, 'public.confirm_round($1, $2)', [round, PIN])
      await tx.exec('reset role')
      const rows = await liveScores(tx, id)
      expect(rows).toHaveLength(4)
      expect(rows[0]!.payload).toMatchObject({ round_no: 1, a: 300, b: 100 })
    })
  })
})
