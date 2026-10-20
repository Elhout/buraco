import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, elevation, radius, space } from '@/theme/tokens'
import { Text } from './Text'

export interface SheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  /** Disable dismissing by tapping the scrim (e.g. while a request is running). */
  locked?: boolean
}

/** Bottom sheet. Every destructive or signing action in the app happens inside one (spec design rules). */
export function Sheet({ visible, onClose, title, subtitle, children, locked }: SheetProps) {
  const insets = useSafeAreaInsets()
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!locked) onClose()
      }}
      statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.scrim}
          accessibilityLabel="Close"
          onPress={() => {
            if (!locked) onClose()
          }}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
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
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    ...elevation.sheet,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginBottom: space.sm },
  header: { gap: space.xs },
})
