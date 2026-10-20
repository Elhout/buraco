import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asUserCommit, createUser } from './harness'

export type Seat = { seat: number; team: 'A' | 'B'; user_id?: string; guest_name?: string }

export interface PinResult {
  ok: boolean
  error?: 'wrong_pin' | 'locked' | 'no_pin'
  attempts_left?: number
  locked_until?: string
  game?: Record<string, unknown>
}

export interface Club {
  clubId: string
  /** [host, partner, opponent1, opponent2] — host and partner are team A. */
  players: [string, string, string, string]
  others: string[]
}

export const PIN = '1234'

export async function setPin(db: PGlite, userId: string, pin = PIN): Promise<void> {
  await asUserCommit(db, userId, (tx) => tx.query(`select public.set_pin($1)`, [pin]))
}

/** A club whose owner is players[0]; every player has PIN 1234. */
export async function seedClub(db: PGlite, name: string, extraMembers = 0): Promise<Club> {
  const players = [
    await createUser(db, `${name}-Omar`),
    await createUser(db, `${name}-Sara`),
    await createUser(db, `${name}-Ahmed`),
    await createUser(db, `${name}-Nour`),
  ] as [string, string, string, string]
  const others: string[] = []
  for (let i = 0; i < extraMembers; i++) others.push(await createUser(db, `${name}-Extra${i}`))
  const clubId = await asUserCommit(db, players[0], async (tx) => {
    const { rows } = await tx.query<{ id: string }>(`select public.create_club($1) as id`, [name])
    return rows[0]!.id
  })
  // Read as superuser: a non-member cannot see the club, which is the point of the code.
  const { rows } = await db.query<{ invite_code: string }>(`select invite_code from public.clubs where id = $1`, [clubId])
  const code = rows[0]!.invite_code
  for (const user of [...players.slice(1), ...others]) {
    await asUserCommit(db, user, (tx) => tx.query(`select public.join_club($1)`, [code.toLowerCase()]))
  }
  for (const user of [...players, ...others]) await setPin(db, user)
  return { clubId, players, others }
}

export const normalSeats = (c: Club): Seat[] => [
  { seat: 1, team: 'A', user_id: c.players[0] },
  { seat: 2, team: 'B', user_id: c.players[2] },
  { seat: 3, team: 'A', user_id: c.players[1] },
  { seat: 4, team: 'B', user_id: c.players[3] },
]

export async function rpc<T = unknown>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0]!.r
}
