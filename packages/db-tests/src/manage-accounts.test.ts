import { describe, expect, it } from 'vitest'
import { parseAccountRequest, usernameCandidates } from '../../../supabase/functions/_shared/accounts.ts'

const CLUB = '11111111-2222-3333-4444-555555555555'
const USER = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'

describe('parseAccountRequest', () => {
  it('parses a create request, normalizing the username and name', () => {
    expect(
      parseAccountRequest({ action: 'create', club_id: CLUB, username: ' Omar.K ', password: 'secret123', display_name: '  Omar   K ' }),
    ).toEqual({ ok: true, request: { action: 'create', clubId: CLUB, username: 'omar.k', password: 'secret123', displayName: 'Omar K' } })
  })

  it('parses a name-only create request (no username, no password: the player cannot sign in)', () => {
    expect(parseAccountRequest({ action: 'create', club_id: CLUB, display_name: ' Samy ' })).toEqual({
      ok: true,
      request: { action: 'create', clubId: CLUB, username: null, password: null, displayName: 'Samy' },
    })
  })

  it('parses a set_password request', () => {
    expect(parseAccountRequest({ action: 'set_password', club_id: CLUB, user_id: USER, password: 'newpass99' })).toEqual({
      ok: true,
      request: { action: 'set_password', clubId: CLUB, userId: USER.toLowerCase(), password: 'newpass99' },
    })
  })

  it.each([
    [null, 'invalid_request'],
    [[], 'invalid_request'],
    ['create', 'invalid_request'],
    [{ action: 'delete', club_id: CLUB, password: 'secret123' }, 'invalid_request'],
    [{ action: 'create', club_id: 'not-a-uuid', username: 'omar', password: 'secret123', display_name: 'Omar' }, 'invalid_request'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123' }, 'invalid_request'],
    [{ action: 'create', club_id: CLUB, username: 'o', password: 'secret123', display_name: 'Omar' }, 'invalid_username'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'short', display_name: 'Omar' }, 'weak_password'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123', display_name: '   ' }, 'invalid_name'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123', display_name: 'x'.repeat(41) }, 'invalid_name'],
    [{ action: 'set_password', club_id: CLUB, password: 'newpass99' }, 'invalid_request'],
    [{ action: 'set_password', club_id: CLUB, user_id: USER, password: '1234' }, 'weak_password'],
  ])('rejects %j with %s', (body, error) => {
    expect(parseAccountRequest(body)).toEqual({ ok: false, error })
  })
})

describe('usernameCandidates', () => {
  const fixed = () => 0.5 // suffix 5500

  it('tries the name in Latin letters first, then with a suffix', () => {
    expect(usernameCandidates('Abu Ali', fixed)).toEqual(['abuali', 'abuali-5500', 'abuali-5500', 'abuali-5500'])
  })

  it('keeps two-letter names', () => {
    expect(usernameCandidates('AK', fixed)).toEqual(['ak', 'ak-5500', 'ak-5500', 'ak-5500'])
  })

  it('starts from "player" for one-letter or non-Latin names', () => {
    expect(usernameCandidates('A', fixed)).toEqual(['player-5500', 'player-5500', 'player-5500'])
    expect(usernameCandidates('سامي', fixed)[0]).toBe('player-5500')
  })

  it('only produces valid usernames', () => {
    for (const name of ['Samy', 'Zoë', 'x'.repeat(60), 'AK', '']) {
      for (const u of usernameCandidates(name)) expect(u).toMatch(/^[a-z0-9][a-z0-9._-]{1,23}$/)
    }
  })
})
