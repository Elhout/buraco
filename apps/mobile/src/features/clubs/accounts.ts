import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

/** Login details an owner/admin sees for a member (club_accounts RPC). */
export interface MemberAccount {
  readonly username: string | null
  /** Whether I may set this member's password (can_manage_account on the server). */
  readonly canManage: boolean
}

/** Usernames and password rights for the club, keyed by user id. Only owners and admins may load it. */
export function useClubAccounts(clubId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: qk.accounts(clubId),
    enabled,
    // A plain object, not a Map: the query cache is saved on the phone as JSON (queryClient.ts).
    queryFn: async (): Promise<Readonly<Record<string, MemberAccount>>> => {
      const rows = await rpc('club_accounts', { p_club_id: clubId })
      return Object.fromEntries(rows.map((r) => [r.user_id, { username: r.username, canManage: r.can_manage }]))
    },
  })
  const byId = query.data ?? {}
  return { ...query, accountOf: (userId: string): MemberAccount | null => (Object.hasOwn(byId, userId) ? byId[userId]! : null) }
}

export type AccountRequest =
  | { action: 'create'; club_id: string; display_name: string; username?: string; password?: string }
  | { action: 'set_password'; club_id: string; user_id: string; password: string }

/** The manage-accounts error code, readable by authErrorKey (`username_taken`, `forbidden`, …). */
export class AccountError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'AccountError'
  }
}

const errorCode = async (context: unknown): Promise<string | null> => {
  if (!(context instanceof Response)) return null
  try {
    const body: unknown = await context.json()
    const code = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : null
    return typeof code === 'string' ? code : null
  } catch {
    return null
  }
}

/** Calls the manage-accounts Edge Function (service role checks happen on the server). */
export async function manageAccount(request: AccountRequest): Promise<{ user_id?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: true; user_id?: string }>('manage-accounts', { body: request })
  if (error) {
    const code = await errorCode((error as { context?: unknown }).context)
    throw code ? new AccountError(code) : error
  }
  return data ?? {}
}
