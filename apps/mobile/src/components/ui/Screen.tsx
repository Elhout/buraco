import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { type Edge, SafeAreaView } from 'react-native-safe-area-context'
import { color, space } from '@/theme/tokens'
import { Text } from './Text'

export interface ScreenProps {
  children: ReactNode
  title?: string
  subtitle?: string
  /** Trailing header content (buttons, avatar). */
  actions?: ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  /** Pinned under the content, e.g. the live screen's action bar. */
  footer?: ReactNode
  edges?: readonly Edge[]
  contentStyle?: ViewStyle
}

export function Screen({
  children,
  title,
  subtitle,
  actions,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
  edges = ['top'],
  contentStyle,
}: ScreenProps) {
  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" tone={color.inkMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions}
    </View>
  ) : null

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl tintColor={color.ink} refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
          }>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      {footer}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, marginBottom: space.xs },
  headerText: { flex: 1, gap: space.xxs },
})
