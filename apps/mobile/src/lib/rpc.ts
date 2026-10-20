import type { Database } from '@buraco/shared'
import { toAppError } from './errors'
import { type PinResult, parsePinResult } from './pin'
import { supabase } from './supabase'

type Fns = Database['public']['Functions']
export type RpcName = keyof Fns
export type RpcArgs<N extends RpcName> = Fns[N]['Args']
export type RpcReturn<N extends RpcName> = Fns[N]['Returns']

/** Typed RPC call; failures become AppError with a translatable code. */
export async function rpc<N extends RpcName>(name: N, args: RpcArgs<N>): Promise<RpcReturn<N>> {
  // supabase-js's overloads cannot follow a generic name, hence the narrow cast.
  const call = supabase.rpc.bind(supabase) as unknown as (n: string, a: unknown) => PromiseLike<{ data: unknown; error: unknown }>
  const { data, error } = await call(name, args)
  if (error) throw toAppError(error)
  return data as RpcReturn<N>
}

/** For RPCs that verify a PIN: a wrong PIN or lockout comes back as a value, not an exception. */
export async function rpcWithPin<N extends RpcName>(name: N, args: RpcArgs<N>): Promise<PinResult> {
  return parsePinResult(await rpc(name, args))
}
