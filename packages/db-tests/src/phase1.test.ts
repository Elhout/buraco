import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asAnon, asUser, asUserCommit, createDb, createUser } from './harness'

type Seat = { seat: number; team: 'A' | 'B'; user_id?: string; guest_name?: string }

interface Game {
  id: string
  status: string
  winner_team: 'A' | 'B' | null
  proposed_winner: 'A' | 'B' | null
  config_snapshot: { target_score: number; cut_bonus: number; allow_negative: boolean }
  started_at: string | null
  finished_at: string | null
}

let db: PGlite
let owner: string, p2: string, p3: string, p4: string, outsider: string
let clubId: string

const fourSeats = (): Seat[] => [
  { seat: 1, team: 'A', user_id: owner },
  { seat: 2, team: 'B', user_id: p2 },
  { seat: 3, team: 'A', user_id: p3 },
  { seat: 4, team: 'B', guest_name: 'Guest Ali' },
]

const createGhost = async (tx: Transaction, seats: Seat[] = fourSeats()): Promise<string> => {
  const { rows } = await tx.query<{ id: string }>(`select public.create_ghost_game($1, $2::jsonb) as id`, [clubId, JSON.stringify(seats)])
  return rows[0]!.id
}

const submit = async (tx: Transaction, gameId: string, a: number, b: number, cuts: number[] = []): Promise<string> => {
  const { rows } = await tx.query<{ id: string }>(`select public.submit_round($1, $2, $3, $4::smallint[]) as id`, [gameId, a, b, cuts])
  return rows[0]!.id
}

const confirm = async (tx: Transaction, roundId: string): Promise<Game> => {
  const { rows } = await tx.query<{ r: { ok: boolean; game: Game } }>(`select public.confirm_round($1) as r`, [roundId])
  return rows[0]!.r.game
}

/** Ghost games: the host confirms the proposed final result with a single tap. */
const confirmResult = async (tx: Transaction, gameId: string): Promise<Game> => {
  const { rows } = await tx.query<{ r: { ok: boolean; game: Game } }>(`select public.confirm_result($1) as r`, [gameId])
  return rows[0]!.r.game
}

const playRound = async (tx: Transaction, gameId: string, a: number, b: number, cuts: number[] = []): Promise<Game> =>
  confirm(tx, await submit(tx, gameId, a, b, cuts))

const totalsOf = async (tx: Transaction, gameId: string) => {
  const { rows } = await tx.query<{ team_a_total: number; team_b_total: number; rounds_played: number }>(
    `select team_a_total, team_b_total, rounds_played from public.v_game_totals where game_id = $1`,
    [gameId],
  )
  return rows[0]!
}

/**
 * One game at a time per player (migration 20261103000000): tests reuse the same four players, so
 * end any game still in progress before starting the next, as a player would by abandoning it.
 */
const freePlayers = async (): Promise<void> => {
  await db.query(`update public.games set status = 'abandoned' where status in ('inviting', 'live')`)
}

beforeAll(async () => {
  db = await createDb()
  owner = await createUser(db, 'Omar')
  p2 = await createUser(db, 'Sara')
  p3 = await createUser(db, 'Ahmed')
  p4 = await createUser(db, 'Nour')
  outsider = await createUser(db, 'Stranger')

  clubId = await asUserCommit(db, owner, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(`insert into public.clubs (name, owner_id) values ('Majlis', $1) returning id`, [owner])
    return rows[0]!.id
  })
  // Joining by invite code is a phase 2 RPC; seed members directly as superuser.
  await db.query(`insert into public.club_members (club_id, user_id) select $1, unnest($2::uuid[])`, [clubId, [p2, p3, p4]])
})

// Outer hooks run before each describe's own: every test starts with nobody at a table.
beforeEach(freePlayers)

describe('accounts and clubs', () => {
  it('creates a profile for every new auth user', async () => {
    const { rows } = await db.query<{ display_name: string }>(`select display_name from public.profiles where id = $1`, [owner])
    expect(rows[0]?.display_name).toBe('Omar')
  })

  it('gives a new club an unambiguous 6-char invite code and makes the creator owner', async () => {
    const { rows } = await db.query<{ invite_code: string; role: string }>(
      `select c.invite_code, m.role from public.clubs c join public.club_members m on m.club_id = c.id and m.user_id = c.owner_id where c.id = $1`,
      [clubId],
    )
    expect(rows[0]?.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(rows[0]?.role).toBe('owner')
  })

  it('truncates an over-long display name instead of failing signup', async () => {
    const id = await createUser(db, 'x'.repeat(60))
    const { rows } = await db.query<{ display_name: string }>(`select display_name from public.profiles where id = $1`, [id])
    expect(rows[0]?.display_name).toHaveLength(40)
  })

  it('does not let even the owner rewrite owner_id or invite_code directly', async () => {
    await expect(asUser(db, owner, (tx) => tx.query(`update public.clubs set owner_id = $2 where id = $1`, [clubId, p2]))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      asUser(db, owner, (tx) => tx.query(`update public.clubs set invite_code = 'AAAAAA' where id = $1`, [clubId])),
    ).rejects.toThrow(/permission denied/)
  })

  it('does not let a client choose the invite code of a new club', async () => {
    await expect(
      asUser(db, outsider, (tx) =>
        tx.query(`insert into public.clubs (name, owner_id, invite_code) values ('Mine', $1, 'AAAAAA')`, [outsider]),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('rejects creating a club on behalf of someone else', async () => {
    await expect(
      asUser(db, outsider, (tx) => tx.query(`insert into public.clubs (name, owner_id) values ('Fake', $1)`, [owner])),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('row level security', () => {
  let gameId: string

  beforeAll(async () => {
    await freePlayers()
    gameId = await asUserCommit(db, owner, (tx) => createGhost(tx))
  })

  it('lets club members read games, seats and profiles of fellow members', async () => {
    await asUser(db, p4, async (tx) => {
      expect((await tx.query(`select 1 from public.games where id = $1`, [gameId])).rows).toHaveLength(1)
      expect((await tx.query(`select 1 from public.game_seats where game_id = $1`, [gameId])).rows).toHaveLength(4)
      expect((await tx.query(`select 1 from public.profiles where id = $1`, [owner])).rows).toHaveLength(1)
    })
  })

  it('hides everything from non-members', async () => {
    await asUser(db, outsider, async (tx) => {
      expect((await tx.query(`select 1 from public.clubs`)).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.games`)).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.game_seats`)).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.v_game_totals`)).rows).toHaveLength(0)
      expect((await tx.query(`select 1 from public.profiles where id = $1`, [owner])).rows).toHaveLength(0)
    })
  })

  it('blocks direct writes to game tables; scores only move through RPCs', async () => {
    await expect(
      asUser(db, owner, (tx) =>
        tx.query(`insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat) values ($1, 99, 5000, 0, 1)`, [
          gameId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
    const updated = await asUser(db, owner, (tx) =>
      tx.query(`update public.games set status = 'finished', winner_team = 'A' where id = $1`, [gameId]),
    )
    expect(updated.affectedRows).toBe(0)
  })

  it('does not let any API role run the internal locking helper', async () => {
    await expect(asUser(db, owner, (tx) => tx.query(`select public.lock_game($1)`, [gameId]))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, (tx) => tx.query(`select public.lock_game($1)`, [gameId]))).rejects.toThrow(/permission denied/)
  })

  it('does not let signed-out clients call game RPCs', async () => {
    await expect(asAnon(db, (tx) => tx.query(`select public.submit_round($1, 1, 1)`, [gameId]))).rejects.toThrow(/permission denied/)
  })
})

describe('create_ghost_game', () => {
  it('starts a live game with a frozen config snapshot and one scorekeeper per team', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      const game = (await tx.query<Game & { mode: string }>(`select * from public.games where id = $1`, [gameId])).rows[0]!
      expect(game.status).toBe('live')
      expect(game.mode).toBe('ghost')
      expect(game.started_at).not.toBeNull()
      expect(game.config_snapshot).toEqual({ target_score: 2000, cut_bonus: 100, allow_negative: true, trust_ghost: true })

      const keepers = await tx.query<{ seat: number; team: string }>(
        `select seat, team from public.game_seats where game_id = $1 and is_scorekeeper order by team`,
        [gameId],
      )
      // Host (seat 1) keeps team A; team B gets its lowest seat.
      expect(keepers.rows).toEqual([
        { seat: 1, team: 'A' },
        { seat: 2, team: 'B' },
      ])

      const events = await tx.query<{ type: string }>(`select type from public.game_events where game_id = $1`, [gameId])
      expect(events.rows).toEqual([{ type: 'created' }])
    })
  })

  it('picks the lowest seat of each team as scorekeeper when the host is not seated', async () => {
    const seats: Seat[] = [
      { seat: 1, team: 'A', user_id: p2 },
      { seat: 2, team: 'B', user_id: p3 },
      { seat: 3, team: 'A', user_id: p4 },
      { seat: 4, team: 'B', guest_name: 'Guest Ali' },
    ]
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx, seats)
      const keepers = await tx.query(`select seat from public.game_seats where game_id = $1 and is_scorekeeper order by seat`, [gameId])
      expect(keepers.rows).toEqual([{ seat: 1 }, { seat: 2 }])
    })
  })

  it('rejects a caller who is not in the club', async () => {
    await expect(asUser(db, outsider, (tx) => createGhost(tx))).rejects.toThrow(/not a member/)
  })

  it('requires exactly four seats', async () => {
    await expect(asUser(db, owner, (tx) => createGhost(tx, fourSeats().slice(0, 3)))).rejects.toThrow(/exactly 4 seats/)
  })

  it('requires two players per team', async () => {
    const seats = fourSeats().map((s) => (s.seat === 2 ? { ...s, team: 'A' as const } : s))
    await expect(asUser(db, owner, (tx) => createGhost(tx, seats))).rejects.toThrow(/2 players/)
  })

  it('rejects seating a non-member', async () => {
    const seats = fourSeats().map((s) => (s.seat === 4 ? { seat: 4, team: 'B' as const, user_id: outsider } : s))
    await expect(asUser(db, owner, (tx) => createGhost(tx, seats))).rejects.toThrow(/belong to the club/)
  })

  it('rejects a seat with both a member and a guest name', async () => {
    const seats = fourSeats().map((s) => (s.seat === 4 ? { seat: 4, team: 'B' as const, user_id: p4, guest_name: 'X' } : s))
    await expect(asUser(db, owner, (tx) => createGhost(tx, seats))).rejects.toThrow(/one_occupant/)
  })
})

describe('rounds and scoring', () => {
  it('sums confirmed rounds plus exact-cut bonuses per team', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await playRound(tx, gameId, 350, 220, [1]) // seat 1 is team A
      await playRound(tx, gameId, -50, 400, [2, 4]) // seats 2 and 4 are team B
      expect(await totalsOf(tx, gameId)).toEqual({ team_a_total: 400, team_b_total: 820, rounds_played: 2 })
    })
  })

  it('excludes a pending round from totals and blocks a second pending round', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await submit(tx, gameId, 500, 100)
      expect(await totalsOf(tx, gameId)).toMatchObject({ team_a_total: 0, team_b_total: 0, rounds_played: 0 })
      await expect(submit(tx, gameId, 10, 10)).rejects.toThrow(/already waiting/)
    })
  })

  it('records who entered and who confirmed', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      const roundId = await submit(tx, gameId, 100, 100)
      await confirm(tx, roundId)
      const { rows } = await tx.query(`select round_no, entered_by_seat, confirmed_by_seat, status from public.rounds where id = $1`, [
        roundId,
      ])
      expect(rows[0]).toEqual({ round_no: 1, entered_by_seat: 1, confirmed_by_seat: 2, status: 'confirmed' })
    })
  })

  it('records the host team as entering when the host sits on team B', async () => {
    const seats: Seat[] = [
      { seat: 1, team: 'A', user_id: p2 },
      { seat: 2, team: 'B', user_id: owner },
      { seat: 3, team: 'A', user_id: p3 },
      { seat: 4, team: 'B', user_id: p4 },
    ]
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx, seats)
      const roundId = await submit(tx, gameId, 100, 100)
      await confirm(tx, roundId)
      const { rows } = await tx.query(`select entered_by_seat, confirmed_by_seat from public.rounds where id = $1`, [roundId])
      expect(rows[0]).toEqual({ entered_by_seat: 2, confirmed_by_seat: 1 })
    })
  })

  it.each([
    ['a duplicate seat', [1, 1]],
    ['a seat outside 1-4', [5]],
    ['more cuts than seats', [1, 2, 3, 4, 1]],
  ])('rejects cut bonuses with %s', async (_label, cuts) => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await expect(submit(tx, gameId, 100, 100, cuts)).rejects.toThrow(/cut seats/)
    })
  })

  it('rejects a null cut seat', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await expect(tx.query(`select public.submit_round($1, 100, 100, array[null]::smallint[])`, [gameId])).rejects.toThrow(/cut seats/)
    })
  })

  it('stops a host who has left the club from scoring', async () => {
    const leaver = await createUser(db, 'Leaver')
    await db.query(`insert into public.club_members (club_id, user_id) values ($1, $2)`, [clubId, leaver])
    const seats = fourSeats().map((s) => (s.seat === 1 ? { ...s, user_id: leaver } : s))
    await freePlayers()
    const gameId = await asUserCommit(db, leaver, (tx) => createGhost(tx, seats))
    await asUserCommit(db, leaver, (tx) =>
      tx.query(`delete from public.club_members where club_id = $1 and user_id = $2`, [clubId, leaver]),
    )
    await expect(asUser(db, leaver, (tx) => submit(tx, gameId, 100, 0))).rejects.toThrow(/not a member/)
  })

  it('refuses to confirm the same round twice', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      const roundId = await submit(tx, gameId, 100, 100)
      await confirm(tx, roundId)
      await expect(confirm(tx, roundId)).rejects.toThrow(/not waiting for confirmation/)
    })
  })

  it('only lets the host score a ghost game', async () => {
    await freePlayers()
    const gameId = await asUserCommit(db, owner, (tx) => createGhost(tx))
    await expect(asUser(db, p2, (tx) => submit(tx, gameId, 100, 0))).rejects.toThrow(/only the host/)
  })

  it('rejects out-of-range round scores', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await expect(submit(tx, gameId, 100_000, 0)).rejects.toThrow(/out of range/)
    })
  })
})

describe('game end rules', () => {
  it('proposes the result when a team reaches the target, and the host confirms it', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      expect(await playRound(tx, gameId, 1900, 500)).toMatchObject({ status: 'live', proposed_winner: null })
      expect(await playRound(tx, gameId, 100, 100)).toMatchObject({ status: 'live', proposed_winner: 'A' })
      const game = await confirmResult(tx, gameId)
      expect(game).toMatchObject({ status: 'finished', winner_team: 'A' })
      expect(game.finished_at).not.toBeNull()
    })
  })

  it('lets team B win alone', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      expect(await playRound(tx, gameId, 300, 2010)).toMatchObject({ proposed_winner: 'B' })
    })
  })

  it('awards the higher total when both teams cross the target', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await playRound(tx, gameId, 1800, 1850)
      expect(await playRound(tx, gameId, 300, 300)).toMatchObject({ proposed_winner: 'B' })
    })
  })

  it('keeps the game live on a tie at or over target, and the next round decides', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      expect(await playRound(tx, gameId, 2050, 2050)).toMatchObject({ status: 'live', proposed_winner: null })
      expect(await playRound(tx, gameId, 0, 50)).toMatchObject({ proposed_winner: 'B' })
    })
  })

  it('counts the cut bonus toward reaching the target', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      expect(await playRound(tx, gameId, 1900, 0, [3])).toMatchObject({ proposed_winner: 'A' })
    })
  })

  it('blocks new rounds while the result awaits confirmation, and after the game ends', async () => {
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await playRound(tx, gameId, 2000, 0)
      await expect(submit(tx, gameId, 10, 10)).rejects.toThrow(/awaiting confirmation/)
    })
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await playRound(tx, gameId, 2000, 0)
      await confirmResult(tx, gameId)
      await expect(submit(tx, gameId, 10, 10)).rejects.toThrow(/not live/)
    })
  })
})

describe('club config snapshot', () => {
  beforeEach(async () => {
    await db.query(`update public.clubs set target_score = 2000, cut_bonus = 100, allow_negative = true where id = $1`, [clubId])
  })

  it('keeps playing with the config a game started with', async () => {
    await freePlayers()
    const gameId = await asUserCommit(db, owner, (tx) => createGhost(tx))
    await asUserCommit(db, owner, (tx) => tx.query(`update public.clubs set target_score = 500, cut_bonus = 50 where id = $1`, [clubId]))
    await asUser(db, owner, async (tx) => {
      expect(await playRound(tx, gameId, 600, 0, [1])).toMatchObject({ status: 'live' })
      const { rows } = await tx.query<{ points: number }>(
        `select l.points from public.round_lines l join public.rounds r on r.id = l.round_id where r.game_id = $1`,
        [gameId],
      )
      expect(rows).toEqual([{ points: 100 }])
    })
  })

  it('rejects negative rounds when the club disallows them', async () => {
    await db.query(`update public.clubs set allow_negative = false where id = $1`, [clubId])
    await asUser(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await expect(submit(tx, gameId, -50, 100)).rejects.toThrow(/negative/)
    })
  })

  it('lets only owners and admins change club config', async () => {
    const res = await asUser(db, p2, (tx) => tx.query(`update public.clubs set target_score = 1 where id = $1`, [clubId]))
    expect(res.affectedRows).toBe(0)
  })
})

describe('game status transitions', () => {
  const finishedGame = async (): Promise<string> =>
    asUserCommit(db, owner, async (tx) => {
      const gameId = await createGhost(tx)
      await playRound(tx, gameId, 2000, 0)
      await confirmResult(tx, gameId)
      return gameId
    })

  it.each([
    ['finished', 'live'],
    ['finished', 'abandoned'],
  ])('rejects %s -> %s', async (_from, to) => {
    const gameId = await finishedGame()
    await expect(db.query(`update public.games set status = $2, winner_team = null where id = $1`, [gameId, to])).rejects.toThrow(
      /finished game is frozen/,
    )
  })

  it('rejects draft -> live for normal games (they must go through inviting)', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.games (club_id, host_id, mode) values ($1, $2, 'normal') returning id`,
      [clubId, owner],
    )
    await expect(db.query(`update public.games set status = 'live' where id = $1`, [rows[0]!.id])).rejects.toThrow(
      /illegal game transition/,
    )
    await db.query(`update public.games set status = 'inviting' where id = $1`, [rows[0]!.id])
    await db.query(`update public.games set status = 'live' where id = $1`, [rows[0]!.id])
  })

  it('rejects inserting a game in any status other than draft', async () => {
    await expect(
      db.query(`insert into public.games (club_id, host_id, mode, status) values ($1, $2, 'ghost', 'live')`, [clubId, owner]),
    ).rejects.toThrow(/created as draft/)
  })

  it('freezes the result of a finished game', async () => {
    const gameId = await finishedGame()
    await expect(db.query(`update public.games set winner_team = 'B' where id = $1`, [gameId])).rejects.toThrow(/finished game is frozen/)
    await expect(db.query(`update public.games set finished_at = now() - interval '1 day' where id = $1`, [gameId])).rejects.toThrow(
      /finished game is frozen/,
    )
  })

  it('still allows marking a finished game verified (ghost retro-verification)', async () => {
    const gameId = await finishedGame()
    await db.query(`update public.games set verified = true where id = $1`, [gameId])
    await expect(db.query(`update public.games set verified = false where id = $1`, [gameId])).rejects.toThrow(/finished game is frozen/)
  })

  it('makes the config snapshot immutable', async () => {
    const gameId = await finishedGame()
    await expect(db.query(`update public.games set config_snapshot = '{}' where id = $1`, [gameId])).rejects.toThrow(/immutable/)
  })
})
