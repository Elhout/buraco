import { z } from 'zod'

/** Shape of every PIN-checked RPC result (see the phase 2 migration header). */
const pinResultSchema = z.union([
  z.object({ ok: z.literal(true), game: z.record(z.string(), z.unknown()).optional() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(['wrong_pin', 'locked', 'no_pin']),
    attempts_left: z.number().optional(),
    locked_until: z.string().optional(),
  }),
])

export type PinResult = z.infer<typeof pinResultSchema>
export type PinFailure = Extract<PinResult, { ok: false }>

export const PIN_LENGTH = 4

export function parsePinResult(value: unknown): PinResult {
  const parsed = pinResultSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new Error('Unexpected PIN result from server')
}

export const isValidPin = (pin: string): boolean => /^[0-9]{4}$/.test(pin)

/** Whole minutes until a lockout ends (at least 1 while still locked). */
export function minutesLeft(lockedUntil: string | undefined, now = Date.now()): number {
  if (!lockedUntil) return 0
  const ms = new Date(lockedUntil).getTime() - now
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 60_000))
}
