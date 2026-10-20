import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { TeamBadge, Text } from '@/components/ui'
import { formatNumber, usesNativeDigits } from '@/lib/format'
import { color, font, radius, space, teamColor, teamSoft, type } from '@/theme/tokens'
import { type FieldError, type FieldState, fieldValue } from './scoreEntry'

interface ScoreFieldProps {
  readonly team: Team
  readonly field: FieldState
  readonly focused: boolean
  readonly allowNegative: boolean
  readonly error: FieldError | null
  readonly onFocus: () => void
  readonly onToggleSign: () => void
}

const MINUS = '−'
const SIGN_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

function display(field: FieldState): string {
  const value = fieldValue(field)
  if (value === null) return field.negative ? MINUS : ''
  return field.negative && value <= 0 ? `${MINUS}${formatNumber(Math.abs(value))}` : formatNumber(value)
}

function SignToggle({ team, negative, onPress }: { team: Team; negative: boolean; onPress: () => void }) {
  const { t } = useTranslation(['game', 'common'])
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: negative }}
      accessibilityLabel={t('enter.signA11y', { team })}
      hitSlop={SIGN_SLOP}
      onPress={onPress}
      style={[styles.sign, negative && { borderColor: teamColor(team), backgroundColor: teamSoft(team) }]}>
      <Text variant="bodyStrong" tone={negative ? teamColor(team) : color.inkMuted}>
        {`${MINUS}/+`}
      </Text>
    </Pressable>
  )
}

/** A big tappable score tile; the shared number pad types into whichever tile is focused. */
export function ScoreField({ team, field, focused, allowNegative, error, onFocus, onToggleSign }: ScoreFieldProps) {
  const { t } = useTranslation(['game', 'common'])
  const text = display(field)
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={t('enter.fieldA11y', { team, value: text || t('enter.empty') })}
        onPress={onFocus}
        style={[
          styles.tile,
          { borderColor: focused ? teamColor(team) : color.line, backgroundColor: focused ? teamSoft(team) : color.sunken },
        ]}>
        <View style={styles.top}>
          <TeamBadge team={team} size="sm" />
          {allowNegative ? <SignToggle team={team} negative={field.negative} onPress={onToggleSign} /> : null}
        </View>
        <Text
          style={[styles.value, usesNativeDigits() && styles.nativeDigits, { color: text ? teamColor(team) : color.inkFaint }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {text || formatNumber(0)}
        </Text>
        <View style={[styles.caret, { backgroundColor: focused ? teamColor(team) : 'transparent' }]} />
      </Pressable>
      <Text variant="caption" tone={color.danger} center style={styles.error} accessibilityLiveRegion="polite">
        {error ? t(`enter.error.${error}`) : ' '}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.xs },
  tile: { minHeight: 112, borderRadius: radius.md, borderWidth: 2, padding: space.sm, gap: space.xs, alignItems: 'center' },
  top: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  value: { ...type.score, fontFamily: font.score, fontVariant: ['tabular-nums'] },
  nativeDigits: { fontFamily: font.bold },
  caret: { width: 28, height: 3, borderRadius: 2 },
  sign: {
    minHeight: 32,
    minWidth: 48,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { minHeight: 16 },
})
