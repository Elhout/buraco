// Bearer-token check for the internal functions (verify_jwt is off; we authenticate ourselves).
// Pure: no Deno APIs, so it can be unit-tested.

const encoder = new TextEncoder()

/** Constant-time string comparison (time depends only on the lengths, never on where bytes differ). */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const len = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

const bearer = (header: string | null): string | null => {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/** True when the Authorization header carries one of the accepted secrets. Empty secrets never match. */
export const isAuthorized = (authorization: string | null, secrets: readonly (string | null | undefined)[]): boolean => {
  const token = bearer(authorization)
  if (token === null) return false
  // Compare against every secret (no early exit) so timing does not reveal which one matched.
  return secrets.reduce<boolean>((ok, s) => (typeof s === 'string' && s !== '' && timingSafeEqual(token, s)) || ok, false)
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
