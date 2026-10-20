import type { PGlite, Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, PIN, type PinResult, normalSeats, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, inTx, rejects } from './harness'

let db: PGlite
let club: Club

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Majlis', 2)
})

const [HOST, PARTNER, OPP1, OPP2] = [0, 1, 2, 3] as const
const player = (i: number): string => club.players[i]!

interface GameRow {
  id: string
  status: string
  mode: string
  winner_team: string | null
  proposed_winner: string | null
  result_confirmed_teams: string[]
  verified: boolean
  invite_expires_at: string
  undo_requested_by: string | null
  abandon_approvals: string[]
}

const game = async (tx: Transaction, id: string): Promise<GameRow> => {
  await tx.exec('reset role')
  const { rows } = await tx.query<GameRow>(
    `select *, abandon_approvals::text[] as abandon_approvals, result_confirmed_teams::text[] as result_confirmed_teams from public.games where id = $1`,
    [id],
  )
  return rows[0]!
}

const seats = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{
    seat: number
    team: string
    invite_status: string
    is_scorekeeper: boolean
    verified_at: string | null
  }>(`select seat, team, invite_status, is_scorekeeper, verified_at from public.game_seats where game_id = $1 order by seat`, [id])
  return rows
}

const queued = async (tx: Transaction, event: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{ user_id: string; payload: Record<string, unknown>; deep_link: string }>(
    `select user_id, payload, deep_link from public.notification_queue where event = $1 order by created_at`,
    [event],
  )
  return rows
}

const createNormal = async (tx: Transaction): Promise<string> => {
  await actAs(tx, player(HOST))
  return rpc<string>(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(normalSeats(club))])
}

const accept = async (tx: Transaction, id: string, who: number, pin = PIN): Promise<PinResult> => {
  await actAs(tx, player(who))
  return rpc<PinResult>(tx, 'public.respond_invite($1, true, $2)', [id, pin])
}

/** A live normal game: host + partner are team A (host keeps score), OPP1 keeps score for B. */
const startLive = async (tx: Transaction): Promise<string> => {
  const id = await createNormal(tx)
  for (const who of [OPP1, PARTNER, OPP2]) await accept(tx, id, who)
  return id
}

const submit = async (tx: Transaction, id: string, who: number, a: number, b: number, cuts: number[] = []): Promise<string> => {
  await actAs(tx, player(who))
  return rpc<string>(tx, 'public.submit_round($1, $2, $3, $4::smallint[])', [id, a, b, cuts])
}

const confirmRound = async (tx: Transaction, roundId: string, who: number, pin = PIN): Promise<PinResult> => {
  await actAs(tx, player(who))
  return rpc<PinResult>(tx, 'public.confirm_round($1, $2)', [roundId, pin])
}

const play = async (tx: Transaction, id: string, a: number, b: number): Promise<void> => {
  const roundId = await submit(tx, id, HOST, a, b)
  expect(await confirmRound(tx, roundId, OPP1)).toMatchObject({ ok: true })
}

const totals = async (tx: Transaction, id: string) => {
  await tx.exec('reset role')
  const { rows } = await tx.query<{ team_a_total: number; team_b_total: number }>(
    `select team_a_total, team_b_total from public.v_game_totals where game_id = $1`,
    [id],
  )
  return rows[0]!
}

describe('invites', () => {
  it('creates an inviting game: host confirmed and scorekeeper, 3 pushes with partner and opponents', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      const g = await game(tx, id)
      expect(g.status).toBe('inviting')
      const minutes = (new Date(g.invite_expires_at).getTime() - Date.now()) / 60_000
      expect(minutes).toBeGreaterThan(9)
      expect(minutes).toBeLessThanOrEqual(10.1)
      expect((await seats(tx, id))[0]).toMatchObject({ invite_status: 'confirmed', is_scorekeeper: true })

      const invites = await queued(tx, 'game_invite')
      expect(invites.map((n) => n.user_id).sort()).toEqual([player(PARTNER), player(OPP1), player(OPP2)].sort())
      const toPartner = invites.find((n) => n.user_id === player(PARTNER))!
      expect(toPartner.payload).toEqual({ host: 'Majlis-Omar', partner: 'Majlis-Omar', opponents: ['Majlis-Ahmed', 'Majlis-Nour'] })
      expect(toPartner.deep_link).toBe(`/game/${id}/invite`)
    })
  })

  it('requires the host to be seated and every seat to be a member', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, player(HOST))
      const without = normalSeats(club).map((s) => (s.seat === 1 ? { ...s, user_id: club.others[0]! } : s))
      await rejects(
        tx,
        () => rpc(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(without)]),
        /host must take a seat/,
      )
    })
    await inTx(db, async (tx) => {
      await actAs(tx, player(HOST))
      const guest = normalSeats(club).map((s) => (s.seat === 4 ? { seat: 4, team: 'B', guest_name: 'Ali' } : s))
      await rejects(
        tx,
        () => rpc(tx, `public.create_game($1, $2::jsonb, 'normal')`, [club.clubId, JSON.stringify(guest)]),
        /guests can only play ghost/,
      )
    })
  })

  it('needs the right PIN to accept and leaves the seat invited on a wrong one', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      expect(await accept(tx, id, OPP1, '0000')).toEqual({ ok: false, error: 'wrong_pin', attempts_left: 4 })
      expect((await seats(tx, id))[1]).toMatchObject({ invite_status: 'invited' })
    })
  })

  it('makes the first confirmed opponent their team’s scorekeeper and goes live when all 4 confirm', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await accept(tx, id, OPP2) // seat 4 confirms first on team B
      await accept(tx, id, OPP1)
      expect((await game(tx, id)).status).toBe('inviting')
      await accept(tx, id, PARTNER)
      expect((await game(tx, id)).status).toBe('live')
      const keepers = (await seats(tx, id)).filter((s) => s.is_scorekeeper).map((s) => s.seat)
      expect(keepers).toEqual([1, 4])
      // Club members not at the table hear about it.
      expect((await queued(tx, 'game_started')).map((n) => n.user_id).sort()).toEqual([...club.others].sort())
    })
  })

  it('skips the game-started push for members who turned it off', async () => {
    await inTx(db, async (tx) => {
      await tx.query(`update public.profiles set notify_game_started = false where id = $1`, [club.others[0]])
      await startLive(tx)
      expect((await queued(tx, 'game_started')).map((n) => n.user_id)).toEqual([club.others[1]])
    })
  })

  it('lets the host swap a declined player, restarting the 10 minutes', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await actAs(tx, player(OPP2))
      await rpc(tx, 'public.respond_invite($1, false)', [id])
      expect((await seats(tx, id))[3]).toMatchObject({ invite_status: 'declined' })
      await actAs(tx, player(PARTNER))
      await rejects(tx, () => tx.query(`select public.swap_seat($1, 4::smallint, $2)`, [id, club.others[0]]), /only the host/)
    })
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await actAs(tx, player(HOST))
      await tx.query(`select public.swap_seat($1, 4::smallint, $2)`, [id, club.others[0]])
      expect((await seats(tx, id))[3]).toMatchObject({ invite_status: 'invited' })
      expect((await queued(tx, 'game_invite')).filter((n) => n.user_id === club.others[0])).toHaveLength(1)
    })
  })

  it('switches to ghost, counting already-confirmed players as verified', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await accept(tx, id, OPP1)
      await actAs(tx, player(HOST))
      await tx.query(`select public.switch_to_ghost($1)`, [id])
      expect(await game(tx, id)).toMatchObject({ status: 'live', mode: 'ghost' })
      const s = await seats(tx, id)
      expect(s.map((x) => x.verified_at !== null)).toEqual([true, true, false, false])
      expect(s.filter((x) => x.is_scorekeeper).map((x) => x.seat)).toEqual([1, 2])
    })
  })

  it('lets only the host cancel, and only before it goes live', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await actAs(tx, player(HOST))
      await tx.query(`select public.cancel_game($1)`, [id])
      expect((await game(tx, id)).status).toBe('abandoned')
    })
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(HOST))
      await rejects(tx, () => tx.query(`select public.cancel_game($1)`, [id]), /already started/)
    })
  })

  it('warns once at 2 minutes left, then expires the invite (cron, service role)', async () => {
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await accept(tx, id, OPP1)
      await tx.exec('reset role')
      await tx.query(`update public.games set invite_expires_at = now() + interval '90 seconds' where id = $1`, [id])
      expect(await asService(tx, () => rpc<number>(tx, 'public.warn_expiring_invites()'))).toBe(1)
      expect(await asService(tx, () => rpc<number>(tx, 'public.warn_expiring_invites()'))).toBe(0)
      expect((await queued(tx, 'invite_expiring')).map((n) => n.user_id).sort()).toEqual([player(PARTNER), player(OPP2)].sort())

      await tx.query(`update public.games set invite_expires_at = now() - interval '1 second' where id = $1`, [id])
      await rejects(tx, () => accept(tx, id, OPP2), /expired/)
    })
    await inTx(db, async (tx) => {
      const id = await createNormal(tx)
      await tx.exec('reset role')
      await tx.query(`update public.games set invite_expires_at = now() - interval '1 second' where id = $1`, [id])
      expect(await asService(tx, () => rpc<number>(tx, 'public.expire_invites()'))).toBe(1)
      expect((await game(tx, id)).status).toBe('expired')
    })
  })

  it('does not let players call the cron functions', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, player(HOST))
      await rejects(tx, () => tx.query(`select public.expire_invites()`), /permission denied/)
    })
  })
})

describe('rounds between two teams', () => {
  it('posts a round only after the other team’s scorekeeper confirms with PIN', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      const roundId = await submit(tx, id, HOST, 350, 220)
      const push = await queued(tx, 'round_to_confirm')
      expect(push).toEqual([{ user_id: player(OPP1), payload: { round_no: 1, a: 350, b: 220 }, deep_link: `/game/${id}` }])

      await rejects(tx, () => confirmRound(tx, roundId, HOST), /other team must confirm/)
      expect(await confirmRound(tx, roundId, OPP1, '9999')).toMatchObject({ ok: false, error: 'wrong_pin' })
      expect(await totals(tx, id)).toEqual({ team_a_total: 0, team_b_total: 0 })
      expect(await confirmRound(tx, roundId, OPP1)).toMatchObject({ ok: true })
      expect(await totals(tx, id)).toEqual({ team_a_total: 350, team_b_total: 220 })
    })
  })

  it('only lets scorekeepers enter scores', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await rejects(tx, () => submit(tx, id, PARTNER, 10, 10), /only scorekeepers/)
    })
  })

  it('lets either team enter, with the opposite team confirming', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      const roundId = await submit(tx, id, OPP1, 100, 300)
      await rejects(tx, () => confirmRound(tx, roundId, OPP1), /other team must confirm/)
      expect(await confirmRound(tx, roundId, HOST)).toMatchObject({ ok: true })
    })
  })

  it('sends a disputed round back to be corrected', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      const roundId = await submit(tx, id, HOST, 900, 0)
      await actAs(tx, player(OPP1))
      await tx.query(`select public.dispute_round($1)`, [roundId])
      const corrected = await submit(tx, id, HOST, 90, 0)
      expect(corrected).toBe(roundId)
      expect(await confirmRound(tx, roundId, OPP1)).toMatchObject({ ok: true })
      expect(await totals(tx, id)).toEqual({ team_a_total: 90, team_b_total: 0 })
    })
  })

  it('rejects a second entry while one awaits confirmation (the offline double-entry case)', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await submit(tx, id, HOST, 100, 100)
      await rejects(tx, () => submit(tx, id, OPP1, 100, 100), /already waiting/)
    })
  })

  it('treats an outbox replay with the same client id as the same round', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      const clientId = crypto.randomUUID()
      await actAs(tx, player(HOST))
      const first = await rpc<string>(tx, `public.submit_round($1, 100, 50, '{}', $2)`, [id, clientId])
      await confirmRound(tx, first, OPP1)
      await actAs(tx, player(HOST))
      const replay = await rpc<string>(tx, `public.submit_round($1, 100, 50, '{}', $2)`, [id, clientId])
      expect(replay).toBe(first)
      expect(await totals(tx, id)).toEqual({ team_a_total: 100, team_b_total: 50 })
    })
  })
})

describe('exact-cut bonus during the deal', () => {
  it('opens the round, lets the score entry fill it, and counts the bonus on confirmation', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(OPP1))
      await rpc(tx, 'public.add_cut($1, 4::smallint)', [id])
      await rejects(tx, () => rpc(tx, 'public.add_cut($1, 4::smallint)', [id]), /already has the cut bonus/)
      const roundId = await submit(tx, id, HOST, 200, 100)
      await rejects(tx, () => rpc(tx, 'public.add_cut($1, 1::smallint)', [id]), /confirm the previous round/)
      await confirmRound(tx, roundId, OPP1)
      expect(await totals(tx, id)).toEqual({ team_a_total: 200, team_b_total: 200 })
    })
  })

  it('removes a bonus tapped by mistake, only while the deal is open', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(HOST))
      const lineId = await rpc<string>(tx, 'public.add_cut($1, 1::smallint)', [id])
      await tx.query(`select public.remove_cut($1)`, [lineId])
      await tx.exec('reset role')
      expect((await tx.query(`select 1 from public.rounds where game_id = $1`, [id])).rows).toHaveLength(0)
    })
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(HOST))
      const lineId = await rpc<string>(tx, 'public.add_cut($1, 1::smallint)', [id])
      await submit(tx, id, HOST, 10, 10)
      await rejects(tx, () => tx.query(`select public.remove_cut($1)`, [lineId]), /round being played/)
    })
  })
})

describe('final result', () => {
  it('needs both scorekeepers’ PIN, then finishes as verified', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await play(tx, id, 2010, 1840)
      expect(await game(tx, id)).toMatchObject({ status: 'live', proposed_winner: 'A' })
      const pushes = await queued(tx, 'result_to_confirm')
      expect(pushes.map((n) => n.user_id).sort()).toEqual([player(HOST), player(OPP1)].sort())
      expect(pushes[0]!.payload).toEqual({ winner: 'A', a: 2010, b: 1840 })

      await actAs(tx, player(HOST))
      expect(await rpc<PinResult>(tx, 'public.confirm_result($1, $2)', [id, PIN])).toMatchObject({ ok: true })
      await rejects(tx, () => rpc(tx, 'public.confirm_result($1, $2)', [id, PIN]), /already confirmed/)
      expect((await game(tx, id)).status).toBe('live')

      await actAs(tx, player(OPP1))
      expect(await rpc<PinResult>(tx, 'public.confirm_result($1, $2)', [id, '0000'])).toMatchObject({ error: 'wrong_pin' })
      await rpc(tx, 'public.confirm_result($1, $2)', [id, PIN])
      expect(await game(tx, id)).toMatchObject({ status: 'finished', winner_team: 'A', verified: true })
    })
  })
})

describe('undo', () => {
  it('voids the last round after the other team approves with PIN, and is audited', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await play(tx, id, 300, 200)
      await play(tx, id, 1800, 0)
      expect((await game(tx, id)).proposed_winner).toBe('A')

      await actAs(tx, player(HOST))
      await tx.query(`select public.request_undo($1)`, [id])
      expect((await queued(tx, 'undo_requested'))[0]).toMatchObject({
        user_id: player(OPP1),
        payload: { requester: 'Majlis-Omar', round_no: 2 },
      })
      await actAs(tx, player(HOST))
      await rejects(tx, () => rpc(tx, 'public.respond_undo($1, true, $2)', [id, PIN]), /other team must approve/)
      await actAs(tx, player(OPP1))
      expect(await rpc<PinResult>(tx, 'public.respond_undo($1, true, $2)', [id, '0000'])).toMatchObject({ error: 'wrong_pin' })
      expect(await rpc<PinResult>(tx, 'public.respond_undo($1, true, $2)', [id, PIN])).toMatchObject({ ok: true })

      expect(await totals(tx, id)).toEqual({ team_a_total: 300, team_b_total: 200 })
      expect(await game(tx, id)).toMatchObject({ proposed_winner: null, undo_requested_by: null })
      const { rows } = await tx.query<{ type: string; payload: { round_no: number } }>(
        `select type, payload from public.game_events where game_id = $1 and type like 'undo%' order by created_at`,
        [id],
      )
      expect(rows.map((r) => r.type)).toEqual(['undo_requested', 'undo'])
      expect(rows[1]!.payload.round_no).toBe(2)
      // Next round number continues after the voided one.
      const next = await submit(tx, id, HOST, 10, 10)
      const { rows: r } = await tx.query<{ round_no: number }>(`select round_no from public.rounds where id = $1`, [next])
      expect(r[0]!.round_no).toBe(3)
    })
  })

  it('can be rejected without a PIN', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await play(tx, id, 300, 200)
      await actAs(tx, player(HOST))
      await tx.query(`select public.request_undo($1)`, [id])
      await actAs(tx, player(OPP1))
      await rpc(tx, 'public.respond_undo($1, false)', [id])
      expect(await totals(tx, id)).toEqual({ team_a_total: 300, team_b_total: 200 })
      expect((await game(tx, id)).undo_requested_by).toBeNull()
    })
  })

  it('happens immediately in a ghost game', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, player(HOST))
      const seatsJson = JSON.stringify(normalSeats(club))
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, seatsJson])
      const r = await rpc<string>(tx, 'public.submit_round($1, 50, 60)', [id])
      await rpc(tx, 'public.confirm_round($1)', [r])
      await tx.query(`select public.request_undo($1)`, [id])
      expect(await totals(tx, id)).toEqual({ team_a_total: 0, team_b_total: 0 })
    })
  })
})

describe('scorekeepers and abandoning', () => {
  it('hands scoring to the partner', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(OPP2))
      await rejects(tx, () => tx.query(`select public.reassign_scorekeeper($1, 3::smallint)`, [id]), /only the host or that team/)
      await actAs(tx, player(HOST))
      await tx.query(`select public.reassign_scorekeeper($1, 3::smallint)`, [id])
      await rejects(tx, () => submit(tx, id, HOST, 1, 1), /only scorekeepers/)
      await submit(tx, id, PARTNER, 1, 1)
    })
  })

  it('abandons a live game only when both scorekeepers approve with PIN', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(HOST))
      expect(await rpc<PinResult>(tx, 'public.abandon_game($1, $2)', [id, '0000'])).toMatchObject({ error: 'wrong_pin' })
      await rpc(tx, 'public.abandon_game($1, $2)', [id, PIN])
      expect(await game(tx, id)).toMatchObject({ status: 'live', abandon_approvals: ['A'] })
      await actAs(tx, player(OPP1))
      await rpc(tx, 'public.abandon_game($1, $2)', [id, PIN])
      expect((await game(tx, id)).status).toBe('abandoned')
    })
  })
})

describe('ghost retro-verification', () => {
  it('asks every member seat to verify and counts the game once all have', async () => {
    await inTx(db, async (tx) => {
      // Clubs that don't trust their scorekeepers (the default trusts them; see trusted-ghost.test.ts).
      await tx.query(`update public.clubs set trust_ghost_games = false where id = $1`, [club.clubId])
      await actAs(tx, player(HOST))
      const seatsJson = JSON.stringify(normalSeats(club).map((s) => (s.seat === 4 ? { seat: 4, team: 'B', guest_name: 'Ali' } : s)))
      const id = await rpc<string>(tx, `public.create_game($1, $2::jsonb, 'ghost')`, [club.clubId, seatsJson])
      const r = await rpc<string>(tx, 'public.submit_round($1, 2000, 100)', [id])
      await rpc(tx, 'public.confirm_round($1)', [r])
      await rpc(tx, 'public.confirm_result($1)', [id])
      expect(await game(tx, id)).toMatchObject({ status: 'finished', verified: false })
      expect((await queued(tx, 'ghost_verify')).map((n) => n.user_id).sort()).toEqual([player(HOST), player(PARTNER), player(OPP1)].sort())

      for (const who of [HOST, PARTNER]) {
        await actAs(tx, player(who))
        await rpc(tx, 'public.verify_ghost_seat($1, $2)', [id, PIN])
      }
      expect((await game(tx, id)).verified).toBe(false)
      await actAs(tx, player(OPP1))
      expect(await rpc<PinResult>(tx, 'public.verify_ghost_seat($1, $2)', [id, '0000'])).toMatchObject({ error: 'wrong_pin' })
      await rpc(tx, 'public.verify_ghost_seat($1, $2)', [id, PIN])
      await rejects(tx, () => rpc(tx, 'public.verify_ghost_seat($1, $2)', [id, PIN]), /already verified/)
      expect((await game(tx, id)).verified).toBe(true)
    })
  })

  it('does not apply to normal games', async () => {
    await inTx(db, async (tx) => {
      const id = await startLive(tx)
      await actAs(tx, player(HOST))
      await rejects(tx, () => rpc(tx, 'public.verify_ghost_seat($1, $2)', [id, PIN]), /only finished ghost games/)
    })
  })
})

describe('push dispatch queue', () => {
  it('claims queued pushes with tokens and language, skipping a phone that has the game open', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, player(OPP1))
      await tx.query(`select public.register_device('ExponentPushToken[opp1-phone]', 'android')`)
      await tx.query(`select public.register_device('ExponentPushToken[opp1-tablet]', 'ios')`)
      await tx.exec('reset role')
      await tx.query(`update public.profiles set lang = 'ar' where id = $1`, [player(OPP1)])
      await tx.query(`delete from public.notification_queue`)

      const id = await startLive(tx)
      await actAs(tx, player(OPP1))
      await tx.query(`select public.set_device_state('ExponentPushToken[opp1-tablet]', 'active', $1)`, [id])
      await tx.exec('reset role')
      await tx.query(`delete from public.notification_queue`)
      await submit(tx, id, HOST, 350, 220)

      const claimed = await asService(tx, () =>
        rpc<{ id: string; event: string; lang: string; tokens: string[] }[]>(tx, 'public.claim_notifications(10)'),
      )
      expect(claimed).toHaveLength(1)
      expect(claimed[0]).toMatchObject({ event: 'round_to_confirm', lang: 'ar', tokens: ['ExponentPushToken[opp1-phone]'] })
      expect(await asService(tx, () => rpc(tx, 'public.claim_notifications(10)'))).toEqual([])

      await asService(tx, () =>
        tx.query(`select public.finish_notifications($1::jsonb, $2)`, [
          JSON.stringify([{ id: claimed[0]!.id, status: 'sent', error: null }]),
          ['ExponentPushToken[opp1-phone]'],
        ]),
      )
      const { rows } = await tx.query(`select status from public.notification_queue where id = $1`, [claimed[0]!.id])
      expect(rows[0]).toEqual({ status: 'sent' })
      expect((await tx.query(`select expo_push_token from public.devices where user_id = $1`, [player(OPP1)])).rows).toEqual([
        { expo_push_token: 'ExponentPushToken[opp1-tablet]' },
      ])
    })
  })

  it('reclaims rows a crashed dispatcher left in sending, and reports attempts', async () => {
    await inTx(db, async (tx) => {
      await tx.exec('reset role')
      await tx.query(`delete from public.notification_queue`)
      await tx.query(
        `insert into public.notification_queue (user_id, event, deep_link, status, attempts, claimed_at)
         values ($1, 'ghost_verify', '/history/x', 'sending', 1, now() - interval '10 minutes'),
                ($1, 'ghost_verify', '/history/y', 'sending', 3, now() - interval '10 minutes'),
                ($1, 'ghost_verify', '/history/z', 'sending', 1, now() - interval '1 minute')`,
        [player(HOST)],
      )
      const claimed = await asService(tx, () => rpc<{ deep_link: string; attempts: number }[]>(tx, 'public.claim_notifications(10)'))
      expect(claimed).toEqual([expect.objectContaining({ deep_link: '/history/x', attempts: 2 })])
      const { rows } = await tx.query(
        `select deep_link, status from public.notification_queue where deep_link in ('/history/y', '/history/z') order by deep_link`,
      )
      // Out of attempts → failed; claimed a minute ago → still being sent, not re-sent.
      expect(rows).toEqual([
        { deep_link: '/history/y', status: 'failed' },
        { deep_link: '/history/z', status: 'sending' },
      ])
    })
  })

  it('is closed to players', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, player(HOST))
      await rejects(tx, () => tx.query(`select public.claim_notifications(10)`), /permission denied/)
      await rejects(tx, () => tx.query(`select 1 from public.notification_queue`), /permission denied/)
    })
  })
})
