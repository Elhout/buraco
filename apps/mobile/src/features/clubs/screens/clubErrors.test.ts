import { describe, expect, it } from 'vitest'
import { clubErrorKey } from './clubErrors'

describe('clubErrorKey', () => {
  it('maps club RPC messages', () => {
    expect(clubErrorKey(new Error('only the club owner can do this'))).toBe('ownerOnly')
    expect(clubErrorKey({ message: 'not allowed to remove this member' })).toBe('notAllowed')
    expect(clubErrorKey({ message: 'member not found' })).toBe('memberGone')
    expect(clubErrorKey({ message: 'new owner must be a club member' })).toBe('memberGone')
    expect(clubErrorKey({ message: 'new row violates check constraint "clubs_name_check"' })).toBe('nameInvalid')
  })

  it('returns null otherwise', () => {
    expect(clubErrorKey(new Error('Network request failed'))).toBeNull()
    expect(clubErrorKey(undefined)).toBeNull()
  })
})
