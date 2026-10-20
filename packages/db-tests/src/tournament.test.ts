import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Match, type PlayedMatch, computeStandings, createRng, rotatingTables, swissPairing } from '../../shared/src/tournament'
import { type Club, PIN, type PinResult, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let members: string[]
let stranger: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Cup', 8) // 12 members with PIN 1234
  members = [...club.players, ...club.others]
  stranger = (await seedClub(db, 'Other')).players[0]
}, 120_000)

const organizer = (): string => members[0]!

interface Entry {
  id: string
  user_id: string | null
  pair_id: string | null
}
interface MatchRow {
  match_id: string
  game_id: string
  table_no: number
  team_a_entries: string[]
  team_b_entries: string[]
  result: string | null
  points_a: number | null
  points_b: number | null
}

const createTournament = async (tx: Transaction, pairing: 'fixed' | 'rotating', format = 'swiss', target = 500): Promise<string> => {
  await actAs(tx, organizer())
  return rpc<string>(
    tx,
    `public.create_tournament($1, 'Autumn Cup', $2::public.tournament_format, $3::public.tournament_pairing, 30, $4)`,
    [club.clubId, format, pairing, target],
  )
}

const entries = async (tx: Transaction, tid: string): Promise<Entry[]> => {
  await tx.exec('reset role')
  return (await tx.query<Entry>(`select id, user_id, pair_id from public.tournament_entries where tournament_id = $1 order by id`, [tid]))
    .rows
}

const matchesOf = async (tx: Transaction, tid: string): Promise<MatchRow[]> => {
  await tx.exec('reset role')
  const { rows } = await tx.query<MatchRow>(
    `select match_id, game_id, table_no, team_a_entries::text[] as team_a_entries, team_b_entries::text[] as team_b_entries,
            result::text as result, points_a, points_b
     from public.v_tournament_matches where tournament_id = $1 order by round_no, table_no`,
    [tid],
  )
  return rows
}

/** Expands engine matches (units) into entry ids for start_round. */
const toDraw = (plan: readonly Match[], unitEntries: (unit: string) => string[]) =>
  plan.map((m, i) => ({ table_no: i + 1, team_a: m.teamA.flatMap(unitEntries), team_b: m.teamB.flatMap(unitEntries) }))

const seatsOf = async (tx: Transaction, gameId: string) => {
  await tx.exec('reset role')
  return (
    await tx.query<{ seat: number; team: string; user_id: string | null; is_scorekeeper: boolean }>(
      `select seat, team, user_id, is_scorekeeper from public.game_seats where game_id = $1 order by seat`,
      [gameId],
    )
  ).rows
}

/** Plays a tournament game on "four phones": PIN invites, one decisive round, both teams confirm. */
const playMatch = async (tx: Transaction, gameId: string, a: number, b: number): Promise<void> => {
  for (const s of await seatsOf(tx, gameId)) {
    if (!s.user_id) continue
    await actAs(tx, s.user_id)
    expect(await rpc<PinResult>(tx, 'public.respond_invite($1, true, $2)', [gameId, PIN])).toMatchObject({ ok: true })
  }
  const seats = await seatsOf(tx, gameId)
  const keeperA = seats.find((s) => s.team === 'A' && s.is_scorekeeper)!.user_id!
  const keeperB = seats.find((s) => s.team === 'B' && s.is_scorekeeper)!.user_id!
  await actAs(tx, keeperA)
  const roundId = await rpc<string>(tx, 'public.submit_round($1, $2, $3)', [gameId, a, b])
  await actAs(tx, keeperB)
  await rpc(tx, 'public.confirm_round($1, $2)', [roundId, PIN])
  for (const keeper of [keeperA, keeperB]) {
    await actAs(tx, keeper)
    await rpc(tx, 'public.confirm_result($1, $2)', [gameId, PIN])
  }
}

const played = (rows: MatchRow[], unitOf: (entry: string) => string): PlayedMatch[] =>
  rows.map((m) => ({
    teamA: [...new Set(m.team_a_entries.map(unitOf))],
    teamB: [...new Set(m.team_b_entries.map(unitOf))],
    result: m.result as PlayedMatch['result'],
    pointsA: m.points_a ?? 0,
    pointsB: m.points_b ?? 0,
  }))

describe('gate: a 12-player Swiss event run live', () => {
  it('pairs 6 fixed pairs over 3 rounds with no rematches and ranks them', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'fixed')
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [
        tid,
        JSON.stringify(members.map((u, i) => ({ user_id: u, pair: `p${Math.floor(i / 2)}` }))),
      ])
      await tx.query(`select public.start_tournament($1)`, [tid])

      const all = await entries(tx, tid)
      const unitOf = (entry: string): string => all.find((e) => e.id === entry)!.pair_id!
      const units = [...new Set(all.map((e) => e.pair_id!))]
      const entriesOf = (unit: string): string[] => all.filter((e) => e.pair_id === unit).map((e) => e.id)
      const rng = createRng(7)

      for (let round = 1; round <= 3; round++) {
        const history = played(await matchesOf(tx, tid), unitOf)
        const plan = swissPairing({ units, standings: computeStandings({ units, matches: history }), history, rng })
        expect(plan.byes).toEqual([])
        await actAs(tx, organizer())
        await tx.query(`select public.start_round($1, $2::jsonb, $3)`, [tid, JSON.stringify(toDraw(plan.matches, entriesOf)), plan.byes])

        // Every entrant is told their table.
        await tx.exec('reset role')
        const pushes = await tx.query(
          `select 1 from public.notification_queue where event = 'tournament_table' and payload->>'round_no' = $1`,
          [String(round)],
        )
        expect(pushes.rows).toHaveLength(12)

        const tables = (await matchesOf(tx, tid)).filter((m) => m.result === null)
        expect(tables).toHaveLength(3)
        for (const [i, m] of tables.entries()) await playMatch(tx, m.game_id, 500 + 10 * i, 300)
      }

      const history = played(await matchesOf(tx, tid), unitOf)
      expect(history.every((m) => m.result === 'a')).toBe(true)
      const meetings = history.map((m) => [m.teamA[0], m.teamB[0]].sort().join('|'))
      expect(new Set(meetings).size).toBe(9) // no rematches
      const standings = computeStandings({ units, matches: history })
      expect(standings.map((s) => s.matchPoints).reduce((a, b) => a + b, 0)).toBe(18)
      expect(standings[0]!.rank).toBe(1)

      await tx.exec('reset role')
      const rounds = await tx.query(`select status from public.tournament_rounds where tournament_id = $1`, [tid])
      expect(rounds.rows.every((r) => (r as { status: string }).status === 'finished')).toBe(true)
      await actAs(tx, organizer())
      await tx.query(`select public.finish_tournament($1)`, [tid])
    })
  })

  it('runs rotating partners for 12 individuals without repeating a partner', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'rotating')
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(members.map((u) => ({ user_id: u })))])
      await tx.query(`select public.start_tournament($1)`, [tid])
      const ids = (await entries(tx, tid)).map((e) => e.id)
      const rng = createRng(3)
      for (let round = 1; round <= 3; round++) {
        const history = played(await matchesOf(tx, tid), (e) => e)
        const plan = rotatingTables({ players: ids, history, rng })
        await actAs(tx, organizer())
        await tx.query(`select public.start_round($1, $2::jsonb)`, [tid, JSON.stringify(toDraw(plan.matches, (u) => [u]))])
        for (const m of (await matchesOf(tx, tid)).filter((x) => x.result === null)) await playMatch(tx, m.game_id, 200, 600)
      }
      const partners = (await matchesOf(tx, tid)).flatMap((m) => [m.team_a_entries, m.team_b_entries].map((t) => [...t].sort().join('|')))
      expect(new Set(partners).size).toBe(partners.length)
    })
  })
})

describe('draw validation', () => {
  const setup = async (tx: Transaction, pairing: 'fixed' | 'rotating') => {
    const tid = await createTournament(tx, pairing)
    const list =
      pairing === 'fixed'
        ? members.slice(0, 8).map((u, i) => ({ user_id: u, pair: `p${Math.floor(i / 2)}` }))
        : members.slice(0, 8).map((u) => ({ user_id: u }))
    await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(list)])
    await tx.query(`select public.start_tournament($1)`, [tid])
    return { tid, all: await entries(tx, tid) }
  }

  it('rejects a seated-twice entrant, a missing entrant and split fixed pairs', async () => {
    await inTx(db, async (tx) => {
      const { tid, all } = await setup(tx, 'fixed')
      const [a, b, c, d, e, f, g, h] = all.sort((x, y) => (x.pair_id! < y.pair_id! ? -1 : 1)).map((x) => x.id)
      await actAs(tx, organizer())
      const start = (draw: unknown, byes: string[] = []) =>
        tx.query(`select public.start_round($1, $2::jsonb, $3)`, [tid, JSON.stringify(draw), byes])
      await rejects(
        tx,
        () =>
          start([
            { table_no: 1, team_a: [a, b], team_b: [c, d] },
            { table_no: 2, team_a: [a, b], team_b: [g, h] },
          ]),
        /seated twice/,
      )
      await rejects(tx, () => start([{ table_no: 1, team_a: [a, b], team_b: [c, d] }]), /seated or have a bye/)
      await rejects(
        tx,
        () =>
          start([
            { table_no: 1, team_a: [a, c], team_b: [b, d] },
            { table_no: 2, team_a: [e, f], team_b: [g, h] },
          ]),
        /stay together/,
      )
      await rejects(tx, () => start([{ table_no: 1, team_a: [a], team_b: [c, d] }]), /two players per team/)
      // A bye for a whole pair is fine.
      await start([
        { table_no: 1, team_a: [a, b], team_b: [c, d] },
        { table_no: 2, team_a: [e, f], team_b: [g, h] },
      ])
    })
  })

  it('requires the organizer, the right entrant counts, and blocks a second live round', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'rotating')
      await actAs(tx, members[1]!)
      await rejects(tx, () => tx.query(`select public.set_entries($1, '[]'::jsonb)`, [tid]), /only the organizer/)
      await actAs(tx, organizer())
      await rejects(
        tx,
        () => tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(members.slice(0, 6).map((u) => ({ user_id: u })))]),
        /multiple of 4/,
      )
      // A ghost seat fills the table.
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [
        tid,
        JSON.stringify([...members.slice(0, 7).map((u) => ({ user_id: u })), { guest_name: 'Ghost' }]),
      ])
      await tx.query(`select public.start_tournament($1)`, [tid])
      const ids = (await entries(tx, tid)).map((e) => e.id)
      await actAs(tx, organizer())
      const draw = [
        { table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2, 4) },
        { table_no: 2, team_a: ids.slice(4, 6), team_b: ids.slice(6, 8) },
      ]
      await tx.query(`select public.start_round($1, $2::jsonb)`, [tid, JSON.stringify(draw)])
      await rejects(tx, () => tx.query(`select public.start_round($1, $2::jsonb)`, [tid, JSON.stringify(draw)]), /still being played/)
      // The ghost seat is pre-confirmed, so its table goes live once the 3 members accept.
      await tx.exec('reset role')
      const { rows } = await tx.query<{ n: number }>(
        `select count(*)::int as n from public.game_seats s join public.v_tournament_matches m on m.game_id = s.game_id
         where m.tournament_id = $1 and s.guest_name = 'Ghost' and s.invite_status = 'confirmed'`,
        [tid],
      )
      expect(rows[0]!.n).toBe(1)
    })
  })

  it('rejects fixed pairs that are not in twos', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'fixed')
      const bad = members.slice(0, 4).map((u, i) => ({ user_id: u, pair: i < 3 ? 'x' : 'y' }))
      await rejects(tx, () => tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(bad)]), /pair of two/)
    })
  })
})

describe('round clock', () => {
  const liveTable = async (tx: Transaction, format = 'swiss') => {
    const tid = await createTournament(tx, 'rotating', format, 2000)
    await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(members.slice(0, 4).map((u) => ({ user_id: u })))])
    await tx.query(`select public.start_tournament($1)`, [tid])
    const ids = (await entries(tx, tid)).map((e) => e.id)
    await actAs(tx, organizer())
    const roundId = await rpc<string>(tx, 'public.start_round($1, $2::jsonb)', [
      tid,
      JSON.stringify([{ table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2) }]),
    ])
    const [match] = await matchesOf(tx, tid)
    for (const s of await seatsOf(tx, match!.game_id)) {
      await actAs(tx, s.user_id!)
      await rpc(tx, 'public.respond_invite($1, true, $2)', [match!.game_id, PIN])
    }
    return { tid, roundId, gameId: match!.game_id }
  }

  const keeper = async (tx: Transaction, gameId: string, team: 'A' | 'B') =>
    (await seatsOf(tx, gameId)).find((s) => s.team === team && s.is_scorekeeper)!.user_id!

  it('warns at 5 minutes, then ends the match after the deal in progress — a draw on equal totals', async () => {
    await inTx(db, async (tx) => {
      const { roundId, gameId } = await liveTable(tx)
      await actAs(tx, await keeper(tx, gameId, 'A'))
      const r = await rpc<string>(tx, 'public.submit_round($1, 300, 300)', [gameId])

      await tx.exec('reset role')
      await tx.query(`update public.tournament_rounds set ends_at = now() + interval '4 minutes' where id = $1`, [roundId])
      expect(await asService(tx, () => rpc<number>(tx, 'public.tournament_clock_tick()'))).toBe(1)
      expect((await tx.query(`select 1 from public.notification_queue where event = 'tournament_clock'`)).rows).toHaveLength(4)

      await tx.query(`update public.tournament_rounds set ends_at = now() - interval '1 second' where id = $1`, [roundId])
      await asService(tx, () => rpc(tx, 'public.tournament_clock_tick()'))
      // The pending deal is still confirmed, and that ends the match even far below target.
      await actAs(tx, await keeper(tx, gameId, 'B'))
      await rpc(tx, 'public.confirm_round($1, $2)', [r, PIN])
      for (const team of ['A', 'B'] as const) {
        await actAs(tx, await keeper(tx, gameId, team))
        await rpc(tx, 'public.confirm_result($1, $2)', [gameId, PIN])
      }
      await tx.exec('reset role')
      const { rows } = await tx.query(`select status, winner_team from public.games where id = $1`, [gameId])
      expect(rows[0]).toEqual({ status: 'finished', winner_team: null })
      const [m] = await tx
        .query<{ result: string; points_a: number }>(
          `select result::text as result, points_a from public.tournament_matches where game_id = $1`,
          [gameId],
        )
        .then((x) => x.rows)
      expect(m).toEqual({ result: 'draw', points_a: 300 })
    })
  })

  it('scores a match between deals as soon as the clock stops', async () => {
    await inTx(db, async (tx) => {
      const { roundId, gameId } = await liveTable(tx)
      await actAs(tx, await keeper(tx, gameId, 'A'))
      const r = await rpc<string>(tx, 'public.submit_round($1, 400, 100)', [gameId])
      await actAs(tx, await keeper(tx, gameId, 'B'))
      await rpc(tx, 'public.confirm_round($1, $2)', [r, PIN])
      await tx.exec('reset role')
      await tx.query(`update public.tournament_rounds set ends_at = now() - interval '1 second' where id = $1`, [roundId])
      await asService(tx, () => rpc(tx, 'public.tournament_clock_tick()'))
      const { rows } = await tx.query(`select proposed_winner from public.games where id = $1`, [gameId])
      expect(rows[0]).toEqual({ proposed_winner: 'A' })
    })
  })

  it('never draws a knockout match: equal totals play on', async () => {
    await inTx(db, async (tx) => {
      const { roundId, gameId } = await liveTable(tx, 'knockout')
      await tx.exec('reset role')
      await tx.query(`update public.tournament_rounds set ends_at = now() - interval '1 second' where id = $1`, [roundId])
      await asService(tx, () => rpc(tx, 'public.tournament_clock_tick()'))
      const { rows } = await tx.query(`select status, result_proposed_at from public.games where id = $1`, [gameId])
      expect(rows[0]).toEqual({ status: 'live', result_proposed_at: null })
    })
  })
})

describe('organizer operations', () => {
  it('substitutes a late arrival into an inviting game and logs it', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'rotating')
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(members.slice(0, 4).map((u) => ({ user_id: u })))])
      await tx.query(`select public.start_tournament($1)`, [tid])
      const all = await entries(tx, tid)
      await actAs(tx, organizer())
      await tx.query(`select public.start_round($1, $2::jsonb)`, [
        tid,
        JSON.stringify([{ table_no: 1, team_a: all.slice(0, 2).map((e) => e.id), team_b: all.slice(2).map((e) => e.id) }]),
      ])
      const late = members[11]!
      const replaced = all.find((e) => e.user_id !== organizer())!
      await tx.query(`select public.substitute_entry($1, $2)`, [replaced.id, late])
      const [m] = await matchesOf(tx, tid)
      expect((await seatsOf(tx, m!.game_id)).some((s) => s.user_id === late)).toBe(true)
      const { rows } = await tx.query(`select type from public.tournament_events where tournament_id = $1 and type = 'substituted'`, [tid])
      expect(rows).toHaveLength(1)
    })
  })

  it('edits a result only with a reason, never a knockout draw', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'rotating', 'knockout')
      await tx.query(`select public.set_entries($1, $2::jsonb)`, [tid, JSON.stringify(members.slice(0, 4).map((u) => ({ user_id: u })))])
      await tx.query(`select public.start_tournament($1)`, [tid])
      const ids = (await entries(tx, tid)).map((e) => e.id)
      await actAs(tx, organizer())
      await tx.query(`select public.start_round($1, $2::jsonb)`, [
        tid,
        JSON.stringify([{ table_no: 1, team_a: ids.slice(0, 2), team_b: ids.slice(2) }]),
      ])
      const [m] = await matchesOf(tx, tid)
      await actAs(tx, organizer())
      await rejects(tx, () => tx.query(`select public.edit_match_result($1, 'a', 500, 0, '  ')`, [m!.match_id]), /reason is required/)
      await rejects(tx, () => tx.query(`select public.edit_match_result($1, 'draw', 0, 0, 'clock')`, [m!.match_id]), /cannot be drawn/)
      await tx.query(`select public.edit_match_result($1, 'b', 100, 900, 'phone died, scored on paper')`, [m!.match_id])
      const [after] = await matchesOf(tx, tid)
      expect(after).toMatchObject({ result: 'b', points_b: 900 })
      await tx.exec('reset role')
      const { rows } = await tx.query(`select status from public.tournament_rounds where tournament_id = $1`, [tid])
      expect(rows).toEqual([{ status: 'finished' }])
    })
  })

  it('keeps tournaments private to the club', async () => {
    await inTx(db, async (tx) => {
      const tid = await createTournament(tx, 'fixed')
      await actAs(tx, stranger)
      expect((await tx.query(`select 1 from public.tournaments where id = $1`, [tid])).rows).toHaveLength(0)
      await rejects(
        tx,
        () =>
          tx.query(
            `insert into public.tournaments (club_id, organizer_id, name, format, pairing, target_score) values ($1, $2, 'x', 'swiss', 'fixed', 1)`,
            [club.clubId, stranger],
          ),
        /permission denied/,
      )
    })
  })
})
