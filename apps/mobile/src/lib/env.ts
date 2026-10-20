import { z } from 'zod'

// EXPO_PUBLIC_* are inlined at build time, so each must be read by its full static name.
const schema = z.object({
  supabaseUrl: z.url(),
  supabaseKey: z.string().min(20),
  sentryDsn: z.string().optional(),
  /** Web Push (web build only): the public half of the VAPID key pair used by push-dispatch. */
  vapidPublicKey: z.string().optional(),
})

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
  vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || undefined,
})

/** null when the build is missing configuration; the root layout shows a setup screen instead of crashing. */
export const env = parsed.success ? parsed.data : null
export const envProblems: readonly string[] = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
