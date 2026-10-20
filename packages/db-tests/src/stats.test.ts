import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { actAs, asUser, createDb, createUser, inTx } from './harness'

/**
 * Phase 3 gate: "stats match a hand count over 20 games". Games are generated deterministically,
 * written straight into the tables, and every stat is recomputed here in plain TypeScript.
 */

type Team = 'A' | 'B'
interface SimGame {
  seats: [string, string, string, string] // seats 1..4; 1,3 = team A, 2,4 = team B
  rounds: { a: number; b: number; cuts: number[] }[]
  finishedAt: Date
}

let db: PGlite
let clubId: string
let players: string[]
let outsider: string
const games: SimGame[] = []

const rng = (() => {
  let s = 42
  return (): number => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
})()
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!

const teamOf = (seatIndex: number): Team => (seatIndex % 2 === 0 ? 'A' : 'B')

const simulate = (finishedAt: Date): SimGame => {
  const pool = [...players].sort(() => rng() - 0.5).slice(0, 4) as SimGame['seats']
  const rounds: SimGame['rounds'] = []
  let a = 0
  let b = 0
  while (!((a >= 2000 || b >= 2000) && a !== b)) {
    const ra = Math.round(rng() * 80 - 10) * 10
    const rb = Math.round(rng() * 80 - 10) * 10
    const cuts = rng() < 0.3 ? [pick([1, 2, 3, 4])] : []
    rounds.push({ a: ra, b: rb, cuts })
    a += ra + cuts.filter((c) => c % 2 === 1).length * 100
    b += rb + cuts.filter((c) => c % 2 === 0).length * 100
  }
  return { seats: pool, rounds, finishedAt }
}

const totalsOf = (g: SimGame): { A: number; B: number } =>
  g.rounds.reduce(
    (t, r) => ({
      A: t.A + r.a + r.cuts.filter((c) => c % 2 === 1).length * 100,
      B: t.B + r.b + r.cuts.filter((c) => c % 2 === 0).length * 100,
    }),
    { A: 0, B: 0 },
  )

/** Writes a finished game directly, walking the legal status path. */
const insertGame = async (g: SimGame, opts: { verified?: boolean; status?: 'finished' | 'abandoned' } = {}): Promise<string> => {
  const t = totalsOf(g)
  const winner: Team = t.A > t.B ? 'A' : 'B'
  const { rows } = await db.query<{ id: string }>(
    `insert into public.games (club_id, host_id, mode) values ($1, $2, 'normal') returning id`,
    [clubId, g.seats[0]],
  )
  const id = rows[0]!.id
  for (let i = 0; i < 4; i++) {
    await db.query(
      `insert into public.game_seats (game_id, seat, team, user_id, invite_status, is_scorekeeper) values ($1, $2, $3, $4, 'confirmed', $5)`,
      [id, i + 1, teamOf(i), g.seats[i], i < 2],
    )
  }
  await db.query(`update public.games set status = 'inviting' where id = $1`, [id])
  await db.query(`update public.games set status = 'live' where id = $1`, [id])
  for (const [n, r] of g.rounds.entries()) {
    const { rows: rr } = await db.query<{ id: string }>(
      `insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat, status, confirmed_by_seat)
       values ($1, $2, $3, $4, 1, 'confirmed', 2) returning id`,
      [id, n + 1, r.a, r.b],
    )
    for (const seat of r.cuts) {
      await db.query(`insert into public.round_lines (round_id, seat, points) values ($1, $2, 100)`, [rr[0]!.id, seat])
    }
  }
  if (opts.status === 'abandoned') {
    await db.query(`update public.games set status = 'abandoned' where id = $1`, [id])
  } else {
    await db.query(`update public.games set status = 'finished', winner_team = $2, verified = $3, finished_at = $4 where id = $1`, [
      id,
      winner,
      opts.verified ?? true,
      g.finishedAt.toISOString(),
    ])
  }
  return id
}

interface Expected {
  games: number
  wins: number
  points: number
  rounds: number
  cuts: number
  bestMargin: number | null
  longest: number
  outcomes: boolean[]
}

const handCount = (): Map<string, Expected> => {
  const m = new Map<string, Expected>()
  for (const g of [...games].sort((x, y) => x.finishedAt.getTime() - y.finishedAt.getTime())) {
    const t = totalsOf(g)
    g.seats.forEach((user, i) => {
      const team = teamOf(i)
      const pf = t[team]
      const pa = t[team === 'A' ? 'B' : 'A']
      const won = pf > pa
      const e = m.get(user) ?? { games: 0, wins: 0, points: 0, rounds: 0, cuts: 0, bestMargin: null, longest: 0, outcomes: [] }
      m.set(user, {
        games: e.games + 1,
        wins: e.wins + (won ? 1 : 0),
        points: e.points + pf,
        rounds: e.rounds + g.rounds.length,
        cuts: e.cuts + g.rounds.reduce((n, r) => n + r.cuts.filter((c) => c === i + 1).length, 0),
        bestMargin: won ? Math.max(e.bestMargin ?? -Infinity, pf - pa) : e.bestMargin,
        longest: Math.max(e.longest, g.rounds.length),
        outcomes: [...e.outcomes, won],
      })
    })
  }
  return m
}

const streaks = (outcomes: boolean[]): { current: number; best: number } => {
  let run = 0
  let best = 0
  for (const won of outcomes) {
    run = won ? run + 1 : 0
    best = Math.max(best, run)
  }
  return { current: run, best }
}

beforeAll(async () => {
  db = await createDb()
  players = []
  for (const name of ['Omar', 'Sara', 'Ahmed', 'Nour', 'Laila', 'Yousef']) players.push(await createUser(db, name))
  outsider = await createUser(db, 'Outsider')
  const { rows } = await db.query<{ id: string }>(`insert into public.clubs (name, owner_id) values ('Stats club', $1) returning id`, [
    players[0],
  ])
  clubId = rows[0]!.id
  for (const p of players.slice(1)) await db.query(`insert into public.club_members (club_id, user_id) values ($1, $2)`, [clubId, p])

  for (let i = 0; i < 20; i++) {
    const g = simulate(new Date(Date.UTC(2026, 8, 1 + i)))
    games.push(g)
    await insertGame(g)
  }
  // Noise that must not count.
  await insertGame(simulate(new Date(Date.UTC(2026, 9, 1))), { verified: false })
  await insertGame(simulate(new Date(Date.UTC(2026, 9, 2))), { status: 'abandoned' })
}, 120_000)

describe('player stats match a hand count over 20 games', () => {
  it('agrees on every player', async () => {
    const expected = handCount()
    const rows = await asUser(db, players[0]!, async (tx) => {
      const r = await tx.query<{
        user_id: string
        games: number
        wins: number
        win_rate: string
        avg_points_per_game: string
        avg_points_per_round: string
        biggest_win_margin: number | null
        longest_game_rounds: number
        cuts: number
        current_streak: number
        best_streak: number
      }>(`select * from public.v_player_stats where club_id = $1`, [clubId])
      return r.rows
    })
    expect(rows).toHaveLength(expected.size)
    for (const row of rows) {
      const e = expected.get(row.user_id)!
      const s = streaks(e.outcomes)
      expect({
        games: row.games,
        wins: row.wins,
        winRate: Number(row.win_rate),
        ppg: Number(row.avg_points_per_game),
        ppr: Number(row.avg_points_per_round),
        margin: row.biggest_win_margin,
        longest: row.longest_game_rounds,
        cuts: row.cuts,
        current: row.current_streak,
        best: row.best_streak,
      }).toEqual({
        games: e.games,
        wins: e.wins,
        winRate: Number((e.wins / e.games).toFixed(4)),
        ppg: Number((e.points / e.games).toFixed(1)),
        ppr: Number((e.points / e.rounds).toFixed(1)),
        margin: e.bestMargin,
        longest: e.longest,
        cuts: e.cuts,
        current: s.current,
        best: s.best,
      })
    }
  })

  it('counts pairs once and h2h from both sides', async () => {
    await asUser(db, players[0]!, async (tx) => {
      const pairs = await tx.query<{ games: number }>(`select games from public.v_pair_stats where club_id = $1`, [clubId])
      expect(pairs.rows.reduce((n, r) => n + r.games, 0)).toBe(40) // 2 pairs per game
      const h2h = await tx.query<{ user_id: string; opponent_id: string; wins: number; losses: number }>(
        `select user_id, opponent_id, wins, losses from public.v_h2h where club_id = $1`,
        [clubId],
      )
      for (const r of h2h.rows) {
        const mirror = h2h.rows.find((x) => x.user_id === r.opponent_id && x.opponent_id === r.user_id)!
        expect([mirror.wins, mirror.losses]).toEqual([r.losses, r.wins])
      }
      const pairH2h = await tx.query<{ games: number }>(`select games from public.v_pair_h2h where club_id = $1`, [clubId])
      expect(pairH2h.rows.reduce((n, r) => n + r.games, 0)).toBe(40)
    })
  })
})

describe('leaderboard', () => {
  it('marks players with at least 10 games eligible and respects the season start', async () => {
    const expected = handCount()
    await inTx(db, async (tx) => {
      await actAs(tx, players[0]!)
      const all = await tx.query<{ user_id: string; games: number; eligible: boolean; point_diff: number }>(
        `select user_id, games, eligible, point_diff from public.v_leaderboard where club_id = $1`,
        [clubId],
      )
      for (const r of all.rows) {
        expect(r.games).toBe(expected.get(r.user_id)!.games)
        expect(r.eligible).toBe(r.games >= 10)
      }
      await tx.exec('reset role')
      await tx.query(`update public.clubs set season_start = '2026-09-11' where id = $1`, [clubId])
      await actAs(tx, players[0]!)
      const season = await tx.query<{ games: number }>(`select games from public.v_leaderboard where club_id = $1`, [clubId])
      expect(season.rows.reduce((n, r) => n + r.games, 0)).toBe(10 * 4)
    })
  })
})

describe('history', () => {
  it('lists finished and abandoned games with seat names, including unverified ghosts', async () => {
    await asUser(db, players[1]!, async (tx) => {
      const { rows } = await tx.query<{ verified: boolean; status: string; seats: { name: string }[] }>(
        `select verified, status, seats from public.v_game_history where club_id = $1 order by finished_at`,
        [clubId],
      )
      expect(rows).toHaveLength(22)
      expect(rows.filter((r) => !r.verified && r.status === 'finished')).toHaveLength(1)
      expect(rows[0]!.seats).toHaveLength(4)
      expect(rows[0]!.seats.every((s) => typeof s.name === 'string')).toBe(true)
    })
  })

  it('shows nothing to people outside the club', async () => {
    await asUser(db, outsider, async (tx) => {
      for (const view of ['v_game_history', 'v_player_stats', 'v_pair_stats', 'v_h2h', 'v_leaderboard']) {
        expect((await tx.query(`select 1 from public.${view}`)).rows).toHaveLength(0)
      }
    })
  })
})
