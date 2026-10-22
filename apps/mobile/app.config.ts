import type { ConfigContext, ExpoConfig } from 'expo/config'

// Native/build-time settings come from the environment (see .env.example). Values here are
// public identifiers, never secrets.
const env = process.env

// Background behind the splash and app launch, per phone theme (matches theme/tokens.ts bg).
/** The club's Expo project (EAS builds and over-the-air updates); not a secret. */
// `||` not `??`: an empty EAS_PROJECT_ID= line in .env.local must not blank it out.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || 'cc58fec2-67ee-4353-9b30-4998d3379c95'

const BG_LIGHT = '#F3EFE7'
const BG_DARK = '#0E1412'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Buraco',
  // Must match the Expo project (EAS). Not shown to players; the app name is "Buraco".
  slug: 'elhout',
  owner: 'elhouts-team',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'buraco',
  userInterfaceStyle: 'automatic',
  backgroundColor: BG_LIGHT,
  ios: {
    icon: './assets/images/icon.png',
    bundleIdentifier: env.APP_BUNDLE_ID ?? 'com.buraco.score',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: env.APP_BUNDLE_ID ?? 'com.buraco.score',
    adaptiveIcon: {
      backgroundColor: BG_DARK,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { output: 'single', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: BG_LIGHT, image: './assets/images/splash-icon.png', imageWidth: 76, dark: { backgroundColor: BG_DARK } },
    ],
    'expo-sqlite',
    ['expo-localization', { supportsRTL: true, supportedLocales: { ios: ['en', 'ar'], android: ['en', 'ar'] } }],
    ['expo-notifications', { color: '#F2B33D', defaultChannel: 'default' }],
    ['expo-local-authentication', { faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID instead of typing your PIN.' }],
    'expo-sharing',
    ['@sentry/react-native/expo', { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT, url: 'https://sentry.io/' }],
    'expo-font',
    'expo-updates',
  ],
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  runtimeVersion: { policy: 'appVersion' },
  extra: { eas: { projectId: EAS_PROJECT_ID } },
  experiments: { typedRoutes: true, reactCompiler: true },
})
