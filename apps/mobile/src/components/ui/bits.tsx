import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { I18nManager, Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native'
import { HIT, type Team, color, font, radius, scheme, space, teamColor, teamSoft } from '@/theme/tokens'
import { Text } from './Text'

/** Team label: always the Latin letter (spec: avoids confusion at the table in Arabic). */
export function TeamBadge({ team, size = 'md' }: { team: Team; size?: 'sm' | 'md' }) {
  const d = size === 'sm' ? 22 : 30
  return (
    <View style={[styles.badge, { width: d, height: d, backgroundColor: teamColor(team) }]} accessibilityLabel={`Team ${team}`}>
      <Text variant={size === 'sm' ? 'caption' : 'label'} tone={color.onPrimary} style={styles.latin}>
        {team}
      </Text>
    </View>
  )
}

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()

/** Muted earth tones (ochre, sage, plum, rust, slate, stone): paper-white initials stay readable on each. */
const HUES = ['#8A6A3C', '#4D7559', '#6B5A88', '#975141', '#3E6385', '#5D615B'] as const
const hueFor = (seed: string): string => HUES[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length]!

export interface AvatarProps {
  name: string
  url?: string | null
  size?: number
  ring?: string
  online?: boolean
}

export function Avatar({ name, url, size = 40, ring, online }: AvatarProps) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: hueFor(name) },
          ring ? { borderWidth: 2, borderColor: ring } : null,
        ]}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <Text variant="label" tone="#F6F2EA" style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
            {initials(name)}
          </Text>
        )}
      </View>
      {online !== undefined ? <View style={[styles.presence, { backgroundColor: online ? color.success : color.inkFaint }]} /> : null}
    </View>
  )
}

/** Progress toward the target in team colour. */
export function TargetBar({ team, value, target }: { team: Team; value: number; target: number }) {
  const pct = Math.max(0, Math.min(1, value / target))
  return (
    <View
      style={[styles.track, { backgroundColor: teamSoft(team) }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: Math.max(0, value) }}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: teamColor(team) }]} />
    </View>
  )
}

export type BannerTone = 'info' | 'danger' | 'success' | 'ghost' | 'warning'
const bannerTone: Record<BannerTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { bg: color.surface, fg: color.ink, icon: 'information-circle-outline' },
  danger: { bg: color.dangerSoft, fg: color.danger, icon: 'cloud-offline-outline' },
  success: { bg: color.successSoft, fg: color.success, icon: 'checkmark-circle-outline' },
  ghost: { bg: color.ghostSoft, fg: color.ghost, icon: 'eye-off-outline' },
  warning: { bg: color.warningSoft, fg: color.warning, icon: 'alert-circle-outline' },
}

export function Banner({ tone = 'info', children, action }: { tone?: BannerTone; children: ReactNode; action?: ReactNode }) {
  const p = bannerTone[tone]
  return (
    <View style={[styles.banner, { backgroundColor: p.bg, borderColor: tone === 'info' ? color.line : p.bg }]} accessibilityRole="alert">
      <Ionicons name={p.icon} size={20} color={p.fg} />
      <Text variant="label" tone={p.fg} style={styles.flex}>
        {children}
      </Text>
      {action}
    </View>
  )
}

export function EmptyState({
  icon = 'albums-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={color.inkFaint} />
      <Text variant="bodyStrong" center>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone={color.inkMuted} center>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  )
}

export interface FieldProps extends TextInputProps {
  label: string
  error?: string | null
  hint?: string
}

export function Field({ label, error, hint, style, ...rest }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text variant="label" tone={color.inkMuted}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={color.inkFaint}
        selectionColor={color.accent}
        {...rest}
        style={[styles.input, error ? { borderColor: color.danger } : null, style]}
        accessibilityLabel={label}
      />
      {error ? (
        <Text variant="caption" tone={color.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone={color.inkFaint}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export interface SegmentedProps<T extends string> {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text variant="label" tone={active ? color.ink : color.inkMuted} center>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Chevron that points "forward" in both LTR and RTL. */
export function Chevron({ tone = color.inkFaint }: { tone?: string }) {
  return <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={tone} />
}

export interface ListRowProps {
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
  danger?: boolean
}

export function ListRow({ title, subtitle, leading, trailing, onPress, danger }: ListRowProps) {
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: color.raised }]}>
      {leading}
      <View style={styles.flex}>
        <Text variant="bodyStrong" tone={danger ? color.danger : color.ink}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone={color.inkMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Chevron /> : null)}
    </Pressable>
  )
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone={color.inkMuted} style={styles.sectionText}>
        {children}
      </Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  latin: { fontFamily: font.bold, writingDirection: 'ltr' },
  badge: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  presence: { position: 'absolute', bottom: 0, end: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color.bg },
  track: { height: 3, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  field: { gap: space.xs },
  input: {
    minHeight: HIT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.lineStrong,
    // Paper fields on the paper page in light mode; recessed ones on the felt in dark mode.
    backgroundColor: scheme === 'light' ? color.surface : color.sunken,
    color: color.ink,
    paddingHorizontal: space.md,
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  segmented: { flexDirection: 'row', backgroundColor: color.sunken, borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md - 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  segmentActive: { backgroundColor: color.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  sectionText: { textTransform: 'uppercase', letterSpacing: 1 },
})
