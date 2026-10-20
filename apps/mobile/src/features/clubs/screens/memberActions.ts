/**
 * What I may do to another member, mirroring the club RPC rules (set_member_role,
 * transfer_ownership: owner only; remove_member: owner removes anyone else, admin removes plain
 * members). Pure; tested in memberActions.test.ts.
 */
export type ClubRole = 'owner' | 'admin' | 'member'

export interface MemberActions {
  readonly promote: boolean
  readonly demote: boolean
  readonly transfer: boolean
  readonly remove: boolean
}

const NONE: MemberActions = { promote: false, demote: false, transfer: false, remove: false }

export function memberActions(myRole: ClubRole, myId: string, target: { userId: string; role: ClubRole }): MemberActions {
  if (target.userId === myId || target.role === 'owner') return NONE
  if (myRole === 'owner') {
    return { promote: target.role === 'member', demote: target.role === 'admin', transfer: true, remove: true }
  }
  if (myRole === 'admin') return { ...NONE, remove: target.role === 'member' }
  return NONE
}

export const hasAnyAction = (a: MemberActions): boolean => a.promote || a.demote || a.transfer || a.remove

const ORDER: Record<ClubRole, number> = { owner: 0, admin: 1, member: 2 }

/** Owner first, then admins, then members; by name within a role. */
export function sortMembers<T extends { role: ClubRole; name: string }>(members: readonly T[], locale: string): T[] {
  return [...members].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name, locale))
}
