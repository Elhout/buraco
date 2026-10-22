import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useMemo, useState } from 'react'
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { HIT, color, elevation, radius, space } from '@/theme/tokens'
import { Text } from './Text'

export interface SheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  /** Disable every way of closing (✕, swipe, scrim, back) while a request is running. */
  locked?: boolean
}

/** How far (px) or how fast (px/ms) a downward drag on the top of the sheet must go to close it. */
const CLOSE_DISTANCE = 90
const CLOSE_VELOCITY = 0.8

/**
 * Bottom sheet. Close it with the ✕, a swipe down from the top (handle and title), a tap outside,
 * or the Android back button. Every destructive action in the app happens inside one.
 */
export function Sheet({ visible, onClose, title, subtitle, children, locked }: SheetProps) {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const [dragY] = useState(() => new Animated.Value(0))
  const close = (): void => {
    if (!locked) onClose()
  }

  // Only the top area drags, so scrolling and number pads inside the sheet keep working.
  // Rebuilt when the close action changes (e.g. locked), so it never calls a stale one.
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch as soon as it starts on the top area: on Android the modal otherwise
        // keeps it and the swipe never reaches us.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => dragY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            dragY.setValue(0)
            if (!locked) onClose()
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 4 }).start()
          }
        },
        onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
      }),
    [dragY, locked, onClose],
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.scrim} accessibilityLabel={t('actions.close')} onPress={close} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, transform: [{ translateY: dragY }] }]}>
          <View {...(locked ? {} : pan.panHandlers)} style={styles.top}>
            <View style={styles.handle} />
            {title ? (
              <View style={styles.header}>
                <Text variant="title" center accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="body" tone={color.inkMuted} center>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {locked ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('actions.close')}
              onPress={close}
              hitSlop={8}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
              <Ionicons name="close" size={20} color={color.inkMuted} />
            </Pressable>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    ...elevation.sheet,
  },
  top: { gap: space.sm, paddingHorizontal: HIT - space.xl },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.lineStrong },
  header: { gap: space.xs },
  close: {
    position: 'absolute',
    top: space.md,
    end: space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: { backgroundColor: color.raised },
})
