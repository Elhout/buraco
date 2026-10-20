import { describe, expect, it } from 'vitest'
import { hasAnyAction, memberActions, sortMembers } from './memberActions'

const member = { userId: 'm', role: 'member' as const }
const admin = { userId: 'a', role: 'admin' as const }
const owner = { userId: 'o', role: 'owner' as const }

describe('memberActions', () => {
  it('lets the owner promote, transfer and remove a member', () => {
    expect(memberActions('owner', 'o', member)).toEqual({ promote: true, demote: false, transfer: true, remove: true })
  })

  it('lets the owner demote an admin', () => {
    expect(memberActions('owner', 'o', admin)).toEqual({ promote: false, demote: true, transfer: true, remove: true })
  })

  it('lets an admin remove plain members only', () => {
    expect(memberActions('admin', 'a', member)).toEqual({ promote: false, demote: false, transfer: false, remove: true })
    expect(hasAnyAction(memberActions('admin', 'a', { userId: 'x', role: 'admin' }))).toBe(false)
    expect(hasAnyAction(memberActions('admin', 'a', owner))).toBe(false)
  })

  it('gives members and self no actions', () => {
    expect(hasAnyAction(memberActions('member', 'm', admin))).toBe(false)
    expect(hasAnyAction(memberActions('owner', 'o', owner))).toBe(false)
  })
})

describe('sortMembers', () => {
  it('orders by role then name', () => {
    const sorted = sortMembers(
      [
        { role: 'member' as const, name: 'Zaid' },
        { role: 'admin' as const, name: 'Sara' },
        { role: 'member' as const, name: 'Ahmed' },
        { role: 'owner' as const, name: 'Omar' },
      ],
      'en',
    )
    expect(sorted.map((m) => m.name)).toEqual(['Omar', 'Sara', 'Ahmed', 'Zaid'])
  })
})
