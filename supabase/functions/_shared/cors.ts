// CORS for the functions the app calls directly (manage-accounts, delete-account). The web build
// (iPhone home-screen app) runs on another origin, so browsers send a preflight first.
// Pure: no Deno APIs, so it can be unit-tested.
//
// "*" is safe here: callers authenticate with a bearer token in a header, never with cookies.

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region',
  'Access-Control-Max-Age': '86400',
}

/** The answer to a browser preflight, or null for a real request. */
export const preflight = (req: Request): Response | null =>
  req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS_HEADERS }) : null

/** Copies the CORS headers onto a response so the browser lets the app read it. */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
