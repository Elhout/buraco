import { describe, expect, it } from 'vitest'
import { parseAccountRequest } from '../../../supabase/functions/_shared/accounts.ts'

const CLUB = '11111111-2222-3333-4444-555555555555'
const USER = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'

describe('parseAccountRequest', () => {
  it('parses a create request, normalizing the username and name', () => {
    expect(
      parseAccountRequest({ action: 'create', club_id: CLUB, username: ' Omar.K ', password: 'secret123', display_name: '  Omar   K ' }),
    ).toEqual({ ok: true, request: { action: 'create', clubId: CLUB, username: 'omar.k', password: 'secret123', displayName: 'Omar K' } })
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
    [{ action: 'create', club_id: CLUB, username: 'omar', display_name: 'Omar' }, 'invalid_request'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123' }, 'invalid_request'],
    [{ action: 'create', club_id: CLUB, username: 'om', password: 'secret123', display_name: 'Omar' }, 'invalid_username'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'short', display_name: 'Omar' }, 'weak_password'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123', display_name: '   ' }, 'invalid_name'],
    [{ action: 'create', club_id: CLUB, username: 'omar', password: 'secret123', display_name: 'x'.repeat(41) }, 'invalid_name'],
    [{ action: 'set_password', club_id: CLUB, password: 'newpass99' }, 'invalid_request'],
    [{ action: 'set_password', club_id: CLUB, user_id: USER, password: '1234' }, 'weak_password'],
  ])('rejects %j with %s', (body, error) => {
    expect(parseAccountRequest(body)).toEqual({ ok: false, error })
  })
})
