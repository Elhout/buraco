import { describe, expect, it } from 'vitest'
import * as app from '../../shared/src/accounts.ts'
import * as fn from '../../../supabase/functions/_shared/accounts.ts'

const USERNAMES = ['omar', ' Omar.K ', 'a', 'ab', 'abc', 'a'.repeat(24), 'a'.repeat(25), '.omar', 'om ar', 'عمر', 'x_y-z', '', 'OMAR@X']
const PASSWORDS = ['', '1234567', '12345678', 'x'.repeat(72), 'x'.repeat(73), 'ب'.repeat(36), 'ب'.repeat(37)]

describe('app and Edge Function account rules agree', () => {
  it('uses the same constants', () => {
    for (const key of ['LOGIN_DOMAIN', 'USERNAME_MIN', 'USERNAME_MAX', 'PASSWORD_MIN', 'PASSWORD_MAX'] as const) {
      expect(fn[key], key).toBe(app[key])
    }
  })

  it.each(USERNAMES)('treats username %j the same', (u) => {
    expect(fn.validateUsername(u)).toEqual(app.validateUsername(u))
    expect(fn.normalizeUsername(u)).toBe(app.normalizeUsername(u))
    expect(fn.loginEmail(u)).toBe(app.loginEmail(u))
  })

  it.each(PASSWORDS)('treats password %j the same', (p) => {
    expect(fn.validatePassword(p)).toEqual(app.validatePassword(p))
  })
})
