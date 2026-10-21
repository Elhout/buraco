import { describe, expect, it } from 'vitest'
import {
  type LobbyGameRow,
  type LobbySeatRow,
  buildLobby,
  gameHref,
  onlineIds,
  sortByPresence,
  teamOf,
  toLobbyGame,
  busyPlayerIds,
} from './model'

const ME = 'me'
const seat = (n: number, userId: string | null, status: LobbySeatRow['invite_status'] = 'confirmed'): LobbySeatRow => ({
  seat: n,
  team: n % 2 === 1 ? 'A' : 'B',
  user_id: userId,
  guest_name: userId ? null : `Guest ${n}`,
  invite_status: status,
  profiles: userId ? { display_name: userId.toUpperCase(), avatar_url: null } : null,
})

const game = (over: Partial<LobbyGameRow> = {}): LobbyGameRow => ({
  id: 'g1',
  status: 'live',
  mode: 'normal',
  host_id: 'h',
  invite_expires_at: null,
  created_at: '2026-10-19T10:00:00Z',
  game_seats: [seat(2, 'b'), seat(1, 'h'), seat(4, 'd'), seat(3, 'c')],
  ...over,
})

describe('toLobbyGame', () => {
  it('orders seats, names the host and fills totals', () => {
    const g = toLobbyGame(game(), { game_id: 'g1', team_a_total: 450, team_b_total: 380, rounds_played: 3 }, ME, 'Guest')
    expect(g?.seats.map((s) => s.seat)).toEqual([1, 2, 3, 4])
    expect(g?.hostName).toBe('H')
    expect(g?.totals).toEqual({ A: 450, B: 380 })
    expect(g?.roundsPlayed).toBe(3)
    expect(g?.imSeated).toBe(false)
  })

  it('defaults totals to zero and names guests', () => {
    const g = toLobbyGame(
      game({ mode: 'ghost', game_seats: [seat(1, 'h'), seat(2, null), seat(3, 'c'), seat(4, 'd')] }),
      undefined,
      ME,
      'Guest',
    )
    expect(g?.totals).toEqual({ A: 0, B: 0 })
    expect(g?.isGhost).toBe(true)
    expect(g?.seats[1]?.name).toBe('Guest 2')
  })

  it('falls back to the guest label when a seat has no name', () => {
    const blank = { ...seat(2, null), guest_name: null }
    const g = toLobbyGame(game({ game_seats: [seat(1, 'h'), blank, seat(3, 'c'), seat(4, 'd')] }), undefined, ME, 'Guest')
    expect(g?.seats[1]?.name).toBe('Guest')
  })

  it('flags my pending invite only while inviting', () => {
    const seats = [seat(1, 'h'), seat(2, ME, 'invited'), seat(3, 'c'), seat(4, 'd')]
    expect(toLobbyGame(game({ status: 'inviting', game_seats: seats }), undefined, ME, 'G')?.myInvite).toBe(true)
    expect(toLobbyGame(game({ status: 'live', game_seats: seats }), undefined, ME, 'G')?.myInvite).toBe(false)
  })

  it('never marks a guest seat as host when the game has no host', () => {
    const g = toLobbyGame(
      game({ host_id: null, game_seats: [seat(1, null), seat(2, 'b'), seat(3, 'c'), seat(4, 'd')] }),
      undefined,
      ME,
      'G',
    )
    expect(g?.seats.some((s) => s.isHost)).toBe(false)
    expect(g?.hostName).toBe('')
  })

  it('drops games that are not active', () => {
    expect(toLobbyGame(game({ status: 'finished' }), undefined, ME, 'G')).toBeNull()
  })
})

describe('buildLobby', () => {
  it('puts my invites first, then my games, then live, then inviting, newest first', () => {
    const rows: LobbyGameRow[] = [
      game({ id: 'other-inviting', status: 'inviting', created_at: '2026-10-19T12:00:00Z' }),
      game({ id: 'other-live-old', created_at: '2026-10-19T08:00:00Z' }),
      game({ id: 'other-live-new', created_at: '2026-10-19T09:00:00Z' }),
      game({ id: 'mine', game_seats: [seat(1, ME), seat(2, 'b'), seat(3, 'c'), seat(4, 'd')] }),
      game({ id: 'invite', status: 'inviting', game_seats: [seat(1, 'h'), seat(2, ME, 'invited'), seat(3, 'c'), seat(4, 'd')] }),
      game({ id: 'gone', status: 'abandoned' }),
    ]
    const totals = [
      { game_id: 'mine', team_a_total: 10, team_b_total: 20, rounds_played: 1 },
      { game_id: null, team_a_total: null, team_b_total: null, rounds_played: null },
    ]
    const lobby = buildLobby(rows, totals, ME, 'G')
    expect(lobby.map((g) => g.id)).toEqual(['invite', 'mine', 'other-live-new', 'other-live-old', 'other-inviting'])
    expect(lobby[1]?.totals).toEqual({ A: 10, B: 20 })
  })
})

describe('helpers', () => {
  it('splits seats by team', () => {
    const g = toLobbyGame(game(), undefined, ME, 'G')!
    expect(teamOf(g, 'A').map((s) => s.seat)).toEqual([1, 3])
    expect(teamOf(g, 'B').map((s) => s.seat)).toEqual([2, 4])
  })

  it('routes inviting games to the invite screen', () => {
    expect(gameHref({ id: 'x', status: 'inviting' })).toBe('/game/x/invite')
    expect(gameHref({ id: 'x', status: 'live' })).toBe('/game/x')
  })

  it('collects presence keys', () => {
    expect([...onlineIds([{ key: 'a' }, { key: 'b' }, { key: 'a' }])].sort()).toEqual(['a', 'b'])
  })

  it('sorts me first, then online, then offline, alphabetically', () => {
    const members = [
      { userId: 'z', name: 'Zed' },
      { userId: 'o2', name: 'Bea' },
      { userId: ME, name: 'Me' },
      { userId: 'o1', name: 'Ali' },
      { userId: 'y', name: 'Amr' },
    ]
    expect(sortByPresence(members, new Set(['o1', 'o2', ME]), ME).map((m) => m.userId)).toEqual([ME, 'o1', 'o2', 'y', 'z'])
  })
})

describe('busyPlayerIds', () => {
  it('collects the members seated in games in progress, not guests', () => {
    const seat = (userId: string | null) => ({ seat: 1, team: 'A' as const, userId, name: userId ?? 'Guest 1', isHost: false, isMe: false })
    const games = [{ seats: [seat('samy'), seat(null), seat('ak')] }, { seats: [seat('noby')] }]
    expect([...busyPlayerIds(games)].sort()).toEqual(['ak', 'noby', 'samy'])
    expect(busyPlayerIds([]).size).toBe(0)
  })
})
