import type { Database } from '@buraco/shared'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import { authStorage } from './authStorage'
import { env } from './env'

// The placeholder only keeps imports safe when configuration is missing; the app shows a
// configuration screen in that case and never calls it.
export const supabase = createClient<Database>(
  env?.supabaseUrl ?? 'http://localhost:54321',
  env?.supabaseKey ?? 'missing-configuration-placeholder-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  })
}
