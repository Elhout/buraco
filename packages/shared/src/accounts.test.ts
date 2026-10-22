import { describe, expect, it } from 'vitest'
import { LOGIN_DOMAIN, loginEmail, normalizeUsername, usernameFromEmail, validatePassword, validateUsername } from './accounts'

describe('validateUsername', () => {
  it.each([
    ['omar', 'omar'],
    ['  Omar.K ', 'omar.k'],
    ['abu_ali-2', 'abu_ali-2'],
    ['abc', 'abc'],
    ['a'.repeat(24), 'a'.repeat(24)],
  ])('accepts %j as %j', (input, username) => {
    expect(validateUsername(input)).toEqual({ ok: true, username })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['a', 'length'],
    ['a'.repeat(25), 'length'],
    ['.omar', 'chars'],
    ['om ar', 'chars'],
    ['عمر123', 'chars'],
    ['omar@x', 'chars'],
  ])('rejects %j (%s)', (input, problem) => {
    expect(validateUsername(input)).toEqual({ ok: false, problem })
  })
})

describe('validatePassword', () => {
  it('needs at least 8 characters and at most 72 bytes', () => {
    expect(validatePassword('1234567')).toEqual({ ok: false, problem: 'short' })
    expect(validatePassword('12345678')).toEqual({ ok: true })
    expect(validatePassword('x'.repeat(72))).toEqual({ ok: true })
    expect(validatePassword('x'.repeat(73))).toEqual({ ok: false, problem: 'long' })
    // Arabic letters are 2 bytes each in UTF-8.
    expect(validatePassword('ب'.repeat(37))).toEqual({ ok: false, problem: 'long' })
  })
})

describe('login emails', () => {
  it('round-trips a username', () => {
    expect(loginEmail(' Omar ')).toBe(`omar@${LOGIN_DOMAIN}`)
    expect(usernameFromEmail(loginEmail('Omar'))).toBe('omar')
    expect(normalizeUsername('OMAR')).toBe('omar')
  })

  it('ignores other addresses', () => {
    expect(usernameFromEmail('omar@gmail.com')).toBeNull()
    expect(usernameFromEmail(null)).toBeNull()
  })
})
