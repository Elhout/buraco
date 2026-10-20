import { describe, expect, it } from 'vitest'
import { authErrorKey } from './authErrors'

describe('authErrorKey', () => {
  it('maps GoTrue and manage-accounts error codes', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'x' })).toBe('wrongPassword')
    expect(authErrorKey({ code: 'over_request_rate_limit', message: 'x' })).toBe('rateLimited')
    expect(authErrorKey({ code: 'email_provider_disabled', message: 'x' })).toBe('providerDisabled')
    expect(authErrorKey({ code: 'username_taken', message: 'x' })).toBe('usernameTaken')
    expect(authErrorKey({ code: 'forbidden', message: 'x' })).toBe('forbidden')
    expect(authErrorKey({ code: 'same_password', message: 'x' })).toBe('samePassword')
    expect(authErrorKey({ code: 'weak_password', message: 'x' })).toBe('weakPassword')
  })

  it('falls back to the message when the code is unknown or missing', () => {
    expect(authErrorKey(new Error('Invalid login credentials'))).toBe('wrongPassword')
    expect(authErrorKey({ message: 'Request rate limit reached' })).toBe('rateLimited')
    expect(authErrorKey('Email logins are disabled')).toBe('providerDisabled')
  })

  it('maps invite code throttling', () => {
    expect(authErrorKey({ message: 'too many invite code attempts, try again later' })).toBe('tooManyCodes')
  })

  it('returns null for errors the common mapping handles', () => {
    expect(authErrorKey(new Error('Network request failed'))).toBeNull()
    expect(authErrorKey(null)).toBeNull()
    expect(authErrorKey({ code: 42 })).toBeNull()
  })
})
