import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, Share, StyleSheet } from 'react-native'
import { Button, ErrorText } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { HIT, color, radius } from '@/theme/tokens'
import type { GameView } from '../model'
import { gameShareText, whatsappUrl } from './shareText'

/** Opens WhatsApp with the game summary; falls back to the phone's share sheet without WhatsApp. */
function useShareGame(view: GameView) {
  const { t } = useTranslation('game')
  const [error, setError] = useState<unknown>(null)
  const share = async (): Promise<void> => {
    setError(null)
    const text = gameShareText(view, (key, values) => String(t(key as never, values as never)), formatNumber)
    try {
      await Linking.openURL(whatsappUrl(text))
    } catch {
      try {
        await Share.share({ message: text })
      } catch (e) {
        setError(e)
      }
    }
  }
  return { share, error }
}

/** Round WhatsApp button for headers (live game). */
export function ShareGameIcon({ view }: { view: GameView }) {
  const { t } = useTranslation('game')
  const { share } = useShareGame(view)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('share.button')}
      onPress={() => void share()}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
      <Ionicons name="logo-whatsapp" size={22} color={color.ink} />
    </Pressable>
  )
}

/** Full-width "Share on WhatsApp" (game history). */
export function ShareGameButton({ view }: { view: GameView }) {
  const { t } = useTranslation('game')
  const { share, error } = useShareGame(view)
  return (
    <>
      <Button
        label={t('share.button')}
        variant="secondary"
        block
        icon={<Ionicons name="logo-whatsapp" size={20} color={color.ink} />}
        onPress={() => void share()}
      />
      <ErrorText error={error} />
    </>
  )
}

const styles = StyleSheet.create({
  icon: { width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.raised },
})
