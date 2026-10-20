import type { ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, View } from 'react-native'
import { kv } from '@/lib/kv'
import { reloadApp } from '@/lib/reload'
import { isStaleBundleError, mayAutoReload } from '@/lib/staleBundle'
import { color, space } from '@/theme/tokens'
import { Button } from './ui/Button'
import { Text } from './ui/Text'

const LAST_AUTO_RELOAD = 'last-auto-reload'

/**
 * Expo Router error boundary: a screen that throws shows this instead of a blank page. On the
 * web, an out-of-date build (after a deploy) reloads itself once to fetch the new files.
 */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation()
  const stale = Platform.OS === 'web' && isStaleBundleError(error)

  useEffect(() => {
    if (!stale) return
    const last = Number(kv.getItemSync(LAST_AUTO_RELOAD)) || null
    if (!mayAutoReload(last, Date.now())) return
    kv.setItemSync(LAST_AUTO_RELOAD, String(Date.now()))
    void reloadApp()
  }, [stale])

  return (
    <View style={styles.root}>
      <Text variant="title" center>
        {stale ? t('errors.updated') : t('errors.screen')}
      </Text>
      <Button label={t('actions.reload')} onPress={() => void reloadApp()} />
      {stale ? null : <Button label={t('actions.retry')} variant="quiet" onPress={() => void retry()} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
})
