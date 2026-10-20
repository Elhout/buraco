import type { Enums, Team } from '@buraco/shared'

/**
 * Pure view-model for the lobby (Club tab): which games are being played right now, what needs
 * my attention, and who is online. No React Native imports, so it runs under Vitest.
 */

export type ActiveStatus = Extract<Enums<'game_status'>, 'inviting' | 'live'>
export const ACTIVE_STATUSES: readonly ActiveStatus[] = ['inviting', 'live']

export interface LobbySeatRow {
  seat: number
  team: Team
  user_id: string | null
  guest_name: string | null
  invite_status: Enums<'invite_status'>
  profiles: { display_name: string; avatar_url: string | null } | null
}

export interface LobbyGameRow {
  id: string
  status: Enums<'game_status'>
  mode: Enums<'game_mode'>
  host_id: string | null
  invite_expires_at: string | null
  created_at: string
  game_seats: LobbySeatRow[]
}

export interface TotalsRow {
  game_id: string | null
  team_a_total: number | null
  team_b_total: number | null
  rounds_played: number | null
}

export interface LobbySeat {
  readonly seat: number
  readonly team: Team
  readonly userId: string | null
  readonly name: string
  readonly avatarUrl: string | null
  readonly inviteStatus: Enums<'invite_status'>
  readonly isMe: boolean
  readonly isHost: boolean
}

export interface LobbyGame {
  readonly id: string
  readonly status: ActiveStatus
  readonly isGhost: boolean
  readonly hostName: string
  readonly inviteExpiresAt: string | null
  readonly createdAt: string
  readonly seats: readonly LobbySeat[]
  readonly totals: Readonly<Record<Team, number>>
  readonly roundsPlayed: number
  /** My seat in this game is still waiting for my PIN. */
  readonly myInvite: boolean
  readonly imSeated: boolean
}

const isActive = (s: Enums<'game_status'>): s is ActiveStatus => s === 'inviting' || s === 'live'

function toSeat(row: LobbySeatRow, me: string | null, hostId: string | null, guestLabel: string): LobbySeat {
  return {
    seat: row.seat,
    team: row.team,
    userId: row.user_id,
    name: row.profiles?.display_name ?? row.guest_name ?? guestLabel,
    avatarUrl: row.profiles?.avatar_url ?? null,
    inviteStatus: row.invite_status,
    isMe: me !== null && row.user_id === me,
    isHost: hostId !== null && row.user_id === hostId,
  }
}

export function toLobbyGame(row: LobbyGameRow, totals: TotalsRow | undefined, me: string | null, guestLabel: string): LobbyGame | null {
  if (!isActive(row.status)) return null
  const seats = [...row.game_seats].sort((a, b) => a.seat - b.seat).map((s) => toSeat(s, me, row.host_id, guestLabel))
  const mine = seats.find((s) => s.isMe)
  return {
    id: row.id,
    status: row.status,
    isGhost: row.mode === 'ghost',
    hostName: seats.find((s) => s.isHost)?.name ?? '',
    inviteExpiresAt: row.invite_expires_at,
    createdAt: row.created_at,
    seats,
    totals: { A: totals?.team_a_total ?? 0, B: totals?.team_b_total ?? 0 },
    roundsPlayed: totals?.rounds_played ?? 0,
    myInvite: row.status === 'inviting' && mine?.inviteStatus === 'invited',
    imSeated: mine !== undefined,
  }
}

/** My invites first, then games I'm in, then live before inviting, newest first. */
const rank = (g: LobbyGame): number => (g.myInvite ? 0 : g.imSeated ? 1 : g.status === 'live' ? 2 : 3)

export function buildLobby(
  rows: readonly LobbyGameRow[],
  totals: readonly TotalsRow[],
  me: string | null,
  guestLabel: string,
): LobbyGame[] {
  const byGame = new Map(totals.flatMap((t) => (t.game_id ? [[t.game_id, t] as const] : [])))
  return rows
    .flatMap((r) => {
      const g = toLobbyGame(r, byGame.get(r.id), me, guestLabel)
      return g ? [g] : []
    })
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))
}

export const teamOf = (game: LobbyGame, team: Team): readonly LobbySeat[] => game.seats.filter((s) => s.team === team)

/** Where tapping a lobby card goes: the invite screen while players are still confirming. */
export const gameHref = (game: Pick<LobbyGame, 'id' | 'status'>): `/game/${string}` =>
  game.status === 'inviting' ? `/game/${game.id}/invite` : `/game/${game.id}`

export interface PresenceEntry {
  readonly key: string
}

/** Presence keys are user ids (the lobby tracks with key = userId); watchers use random keys. */
export const onlineIds = (entries: readonly PresenceEntry[]): ReadonlySet<string> => new Set(entries.map((e) => e.key))

export interface NamedMember {
  readonly userId: string
  readonly name: string
}

/** Me first, then online members, then everyone else; alphabetical inside each group. */
export function sortByPresence<M extends NamedMember>(members: readonly M[], online: ReadonlySet<string>, me: string | null): M[] {
  const group = (m: M): number => (m.userId === me ? 0 : online.has(m.userId) ? 1 : 2)
  return [...members].sort((a, b) => group(a) - group(b) || a.name.localeCompare(b.name))
}
