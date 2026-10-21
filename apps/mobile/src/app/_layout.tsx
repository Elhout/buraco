// Must run before any other module: older Safari lacks some newer built-ins.
import '@/lib/polyfills'
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
import { useEffect, useState } from 'react'
import { ActivityIndicator, I18nManager, View } from 'react-native'
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

const FONT_WAIT_MS = 3000

/** Shown while the session and player list load, so a slow start never looks like a dead page. */
function Starting() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
      <ActivityIndicator color={color.inkMuted} />
    </View>
  )
}

function RootLayout() {
  const [fontWaitOver, setFontWaitOver] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS)
    return () => clearTimeout(timer)
  }, [])
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  })

  // Never block on fonts: a slow or failed font load (seen on iPhone Safari) used to leave a black
  // page forever. Start after FONT_WAIT_MS at the latest; the fonts swap in when they arrive.
  if (!fontsLoaded && !fontError && !fontWaitOver) return null
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

/** Route guards: signed out → (auth); otherwise the app (joining the group happens at sign-in). */
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

  if (!settled) return <Starting />
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
        <Stack.Protected guard={ready && hasClub}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="game/[id]/index" />
          <Stack.Screen name="game/[id]/invite" />
          <Stack.Screen name="game/[id]/result" />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="club/settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="player/[id]" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
    </LocaleProvider>
  )
}

/** Any screen that throws shows a reload screen instead of a blank page (see ScreenError). */
export const ErrorBoundary = ScreenError

export default Sentry.wrap(RootLayout)
