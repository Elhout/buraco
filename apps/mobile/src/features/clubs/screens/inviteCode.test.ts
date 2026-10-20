import { describe, expect, it } from 'vitest'
import { inviteLink, isValidInviteCode, normalizeInviteCode, parseInviteCode, sanitizeCodeInput, spacedCode } from './inviteCode'

describe('normalizeInviteCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeInviteCode('  abc234 ')).toBe('ABC234')
  })

  it('strips the buraco://join/ prefix from scanned QR text', () => {
    expect(normalizeInviteCode('buraco://join/ABC234')).toBe('ABC234')
    expect(normalizeInviteCode('BURACO://JOIN/abc234')).toBe('ABC234')
    expect(normalizeInviteCode('buraco:///join/abc234?ref=qr')).toBe('ABC234')
  })

  it('drops spaces and dashes people type', () => {
    expect(normalizeInviteCode('abc-234')).toBe('ABC234')
    expect(normalizeInviteCode('ABC 234')).toBe('ABC234')
  })

  it('converts Arabic-Indic digits', () => {
    expect(normalizeInviteCode('abc٢٣٤')).toBe('ABC234')
  })
})

describe('isValidInviteCode / parseInviteCode', () => {
  it('accepts 6 characters from the alphabet', () => {
    expect(isValidInviteCode('ABC234')).toBe(true)
    expect(parseInviteCode('buraco://join/xyz789')).toBe('XYZ789')
  })

  it('rejects ambiguous characters I, O, 0 and 1', () => {
    expect(isValidInviteCode('ABCDE1')).toBe(false)
    expect(isValidInviteCode('ABCDEO')).toBe(false)
    expect(isValidInviteCode('ABCDE0')).toBe(false)
    expect(isValidInviteCode('ABCDEI')).toBe(false)
  })

  it('rejects wrong lengths and foreign text', () => {
    expect(parseInviteCode('ABC23')).toBeNull()
    expect(parseInviteCode('ABC2345')).toBeNull()
    expect(parseInviteCode('https://example.com')).toBeNull()
    expect(parseInviteCode('')).toBeNull()
  })
})

describe('sanitizeCodeInput', () => {
  it('keeps only alphabet characters, up to 6', () => {
    expect(sanitizeCodeInput('ab-c0o1234xyz')).toBe('ABC234')
    expect(sanitizeCodeInput('buraco://join/QWE')).toBe('QWE')
  })
})

describe('inviteLink / spacedCode', () => {
  it('builds the QR payload', () => {
    expect(inviteLink('ABC234')).toBe('buraco://join/ABC234')
    expect(parseInviteCode(inviteLink('ABC234'))).toBe('ABC234')
  })

  it('splits a full code in two groups', () => {
    expect(spacedCode('ABC234')).toBe('ABC 234')
    expect(spacedCode('ABC')).toBe('ABC')
  })
})
