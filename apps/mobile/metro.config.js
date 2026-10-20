// Expo's default config (monorepo-aware) wrapped by Sentry for source maps.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

module.exports = getSentryExpoConfig(__dirname)
