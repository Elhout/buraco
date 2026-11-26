import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type RatedGame, rateGames } from '../../shared/src/rating'
import { type Club, seedClub } from './fixtures'
import { asUser, createDb, createUser } from './harness'

/**
 * public.club_ratings must agree with the shared rateGames replay: same order (oldest first),
 * same formula, guests at 1500 and unrated, only games that count in the stats.
 */

let db: PGlite
let club: Club
let outsider: string
let everyone: string[]

type Team = 'A' | 'B'
interface Sim {
  seats: [string | null, string | null, string | null, string | null] // 1,3 = A; 2,4 = B
  a: number
  b: number
  verified?: boolean
}

const sims: { sim: Sim; at: Date }[] = []

/** Writes a finished normal game directly, walking the legal status path. */
const insertGame = async (sim: Sim, at: Date): Promise<void> => {
  const host = sim.seats.find((s) => s !== null)!
  const { rows } = await db.query<{ id: string }>(
    `insert into public.games (club_id, host_id, mode) values ($1, $2, 'normal') returning id`,
    [club.clubId, host],
  )
  const id = rows[0]!.id
  for (let i = 0; i < 4; i++) {
    const user = sim.seats[i]
    await db.query(
      `insert into public.game_seats (game_id, seat, team, user_id, guest_name, invite_status, is_scorekeeper)
       values ($1, $2, $3, $4, $5, 'confirmed', $6)`,
      [id, i + 1, i % 2 === 0 ? 'A' : 'B', user, user ? null : `Guest${i}`, i < 2],
    )
  }
  await db.query(`update public.games set status = 'inviting' where id = $1`, [id])
  await db.query(`update public.games set status = 'live' where id = $1`, [id])
  await db.query(
    `insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat, status, confirmed_by_seat)
     values ($1, 1, $2, $3, 1, 'confirmed', 2)`,
    [id, sim.a, sim.b],
  )
  const winner: Team | null = sim.a > sim.b ? 'A' : sim.a < sim.b ? 'B' : null
  await db.query(`update public.games set status = 'finished', winner_team = $2, verified = $3, finished_at = $4 where id = $1`, [
    id,
    winner,
    sim.verified ?? true,
    at.toISOString(),
  ])
}

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Elo', 2)
  outsider = await createUser(db, 'Stranger')
  everyone = [...club.players, ...club.others]
  const [p0, p1, p2, p3] = club.players
  const [e0, e1] = club.others as [string, string]
  const plan: Sim[] = [
    { seats: [p0, p2, p1, p3], a: 2100, b: 900 },
    { seats: [p0, p2, p1, p3], a: 2050, b: 1800 },
    { seats: [e0, p0, e1, p1], a: 2200, b: 1500 }, // newcomers beat the strong pair
    { seats: [p2, e0, p3, null], a: 1200, b: 2000 }, // a guest at the table
    { seats: [p0, p1, p2, p3], a: 1900, b: 2050 },
    { seats: [e1, p0, e0, p1], a: 0, b: 2500, verified: false }, // an unconfirmed ghost: ignored
    { seats: [p1, p0, p3, p2], a: 2300, b: 400 },
  ]
  for (const [i, sim] of plan.entries()) {
    const at = new Date(Date.UTC(2026, 10, 1 + i, 20))
    await insertGame(sim, at)
    sims.push({ sim, at })
  }
}, 120_000)

const replay = (): Map<string, { rating: number; games: number }> =>
  rateGames(
    sims
      .filter(({ sim }) => sim.verified !== false)
      .map(({ sim }): RatedGame => ({
        teamA: [sim.seats[0], sim.seats[2]],
        teamB: [sim.seats[1], sim.seats[3]],
        winner: sim.a > sim.b ? 'A' : sim.a < sim.b ? 'B' : null,
      })),
  )

describe('club_ratings (Elo)', () => {
  it('matches the shared replay for every player', async () => {
    const rows = await asUser(
      db,
      club.players[0],
      async (tx) =>
        (await tx.query<{ user_id: string; rating: number; games: number }>(`select * from public.club_ratings($1)`, [club.clubId])).rows,
    )
    const expected = replay()
    expect(rows.map((r) => r.user_id).sort()).toEqual([...expected.keys()].sort())
    for (const r of rows) {
      const e = expected.get(r.user_id)!
      expect(Number(r.games)).toBe(e.games)
      expect(Number(r.rating)).toBeCloseTo(e.rating, 6)
    }
    expect(everyone.every((id) => expected.has(id))).toBe(true)
  })

  it('the newcomers who beat the strong pair are rated above 1500 after few games', async () => {
    const rows = await asUser(
      db,
      club.players[0],
      async (tx) =>
        (await tx.query<{ user_id: string; rating: number; games: number }>(`select * from public.club_ratings($1)`, [club.clubId])).rows,
    )
    const e1 = rows.find((r) => r.user_id === club.others[1])!
    expect(Number(e1.games)).toBe(1)
    expect(Number(e1.rating)).toBeGreaterThan(1516)
  })

  it('shows nothing to someone outside the club', async () => {
    const rows = await asUser(db, outsider, async (tx) => (await tx.query(`select * from public.club_ratings($1)`, [club.clubId])).rows)
    expect(rows).toEqual([])
  })
})
