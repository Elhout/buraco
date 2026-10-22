import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Button, ErrorText, Sheet, Text } from '@/components/ui'
import { HIT, color, radius, space } from '@/theme/tokens'

/** Small building blocks shared by the history and stats screens. */

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <View style={styles.block} accessibilityRole="progressbar" accessibilityLabel={label ?? t('loading')}>
      <ActivityIndicator color={color.inkMuted} />
    </View>
  )
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <View style={styles.block}>
      <ErrorText error={error} />
      <Button label={t('actions.retry')} variant="secondary" onPress={onRetry} />
    </View>
  )
}

export type PillTone = 'success' | 'ghost' | 'danger' | 'neutral' | 'warning'

const pillColors: Record<PillTone, { bg: string; fg: string }> = {
  success: { bg: color.successSoft, fg: color.success },
  ghost: { bg: color.ghostSoft, fg: color.ghost },
  danger: { bg: color.dangerSoft, fg: color.danger },
  neutral: { bg: color.raised, fg: color.inkMuted },
  warning: { bg: color.warningSoft, fg: color.warning },
}

export function Pill({ label, tone, icon }: { label: string; tone: PillTone; icon?: keyof typeof Ionicons.glyphMap }) {
  const p = pillColors[tone]
  return (
    <View style={[styles.pill, { backgroundColor: p.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={p.fg} /> : null}
      <Text variant="caption" tone={p.fg}>
        {label}
      </Text>
    </View>
  )
}

export interface ChipProps {
  label: string
  selected: boolean
  onPress: () => void
  /** Shows a dropdown caret: the chip opens a picker. */
  picker?: boolean
}

export function Chip({ label, selected, onPress, picker }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
      {selected && !picker ? <Ionicons name="checkmark" size={14} color={color.onPrimary} /> : null}
      <Text variant="label" tone={selected ? color.onPrimary : color.ink}>
        {label}
      </Text>
      {picker ? <Ionicons name="chevron-down" size={14} color={selected ? color.onPrimary : color.inkMuted} /> : null}
    </Pressable>
  )
}

export interface SheetOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly leading?: ReactNode
}

export interface OptionSheetProps<T extends string> {
  visible: boolean
  title: string
  options: readonly SheetOption<T>[]
  selected: T | null
  onSelect: (value: T) => void
  onClose: () => void
}

/** Pick one value from a list (date presets, players). */
export function OptionSheet<T extends string>({ visible, title, options, selected, onSelect, onClose }: OptionSheetProps<T>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={styles.sheetList}>
        {options.map((o) => {
          const active = o.value === selected
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onSelect(o.value)
                onClose()
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: color.raised }]}>
              {o.leading}
              <Text variant="bodyStrong" style={styles.flex}>
                {o.label}
              </Text>
              {active ? <Ionicons name="checkmark" size={22} color={color.ink} /> : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </Sheet>
  )
}

export function Footnote({ children }: { children: string }) {
  return (
    <View style={styles.footnote}>
      <Ionicons name="shield-checkmark-outline" size={14} color={color.inkFaint} />
      <Text variant="caption" tone={color.inkFaint} style={styles.flex}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  pressed: { opacity: 0.8 },
  sheetList: { maxHeight: 420 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HIT,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  footnote: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start', paddingTop: space.sm },
})
