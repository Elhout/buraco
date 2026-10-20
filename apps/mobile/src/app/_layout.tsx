import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed'
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic'
import * as Sentry from '@sentry/react-native'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { LocaleProvider, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { I18nManager } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ConfigMissing } from '@/components/ConfigMissing'
import { LoadFailed } from '@/components/LoadFailed'
import { ScreenError } from '@/components/ScreenError'
import { SessionProvider, useSession } from '@/features/auth/SessionProvider'
import { ClubProvider, useClubs } from '@/features/clubs/ClubProvider'
import { syncDirectionOnLaunch } from '@/i18n'
import { env } from '@/lib/env'
import { startOutbox } from '@/lib/outbox'
import { startPushRouting } from '@/lib/push'
import { PERSIST_BUSTER, PERSIST_MAX_AGE, persister, queryClient, wireQueryEnvironment } from '@/lib/queryClient'
import { watchSystemScheme } from '@/theme/scheme'
import { color, scheme } from '@/theme/tokens'

void SplashScreen.preventAutoHideAsync()
syncDirectionOnLaunch()
wireQueryEnvironment()
if (env?.sentryDsn) Sentry.init({ dsn: env.sentryDsn, tracesSampleRate: 0.1, sendDefaultPii: false })

function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  })

  if (!fontsLoaded) return null
  if (!env) {
    void SplashScreen.hideAsync()
    return <ConfigMissing />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER }}>
          <SessionProvider>
            <ClubProvider>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <RootNavigator />
            </ClubProvider>
          </SessionProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * Route guards follow the onboarding stage: signed out → (auth); missing profile or PIN →
 * (onboarding); no club yet → club-setup; otherwise the app.
 */
function RootNavigator() {
  const { stage, refreshProfile } = useSession()
  const { clubs, loading: clubsLoading, failed: clubsFailed, refresh: refreshClubs } = useClubs()
  const ready = stage === 'ready'
  const settled = stage !== 'loading' && !(ready && clubsLoading)
  const hasClub = clubs.length > 0
  const failed = stage === 'error' || (ready && clubsFailed)
  const inApp = settled && ready && hasClub

  useEffect(() => {
    if (settled) void SplashScreen.hideAsync()
  }, [settled])

  useEffect(() => startOutbox(queryClient), [])
  useEffect(() => watchSystemScheme(), [])

  // Only once the navigator is mounted and the app routes exist, so a tap that launched the app lands.
  useEffect(() => (inApp ? startPushRouting() : undefined), [inApp])

  if (!settled) return null
  if (failed) {
    return (
      <LoadFailed
        onRetry={() => {
          void refreshProfile()
          void refreshClubs().catch(() => undefined)
        }}
      />
    )
  }

  return (
    <LocaleProvider direction={I18nManager.isRTL ? 'rtl' : 'ltr'}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="index" />
        {/* Quick game calculator: no sign-in, open in every stage. */}
        <Stack.Screen name="quick" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Protected guard={stage === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'needsProfile' || stage === 'needsPin'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={ready && !hasClub}>
          <Stack.Screen name="club-setup" />
        </Stack.Protected>
        <Stack.Protected guard={ready}>
          {/* buraco://join/<CODE> from a club QR code, with or without a club already. */}
          <Stack.Screen name="join/[code]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && hasClub}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="game/[id]/index" />
          <Stack.Screen name="game/[id]/invite" />
          <Stack.Screen name="game/[id]/result" />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="club/settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="club/join" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
      </Stack>
    </LocaleProvider>
  )
}

/** Any screen that throws shows a reload screen instead of a blank page (see ScreenError). */
export const ErrorBoundary = ScreenError

export default Sentry.wrap(RootLayout)
