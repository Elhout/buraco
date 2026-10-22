import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Avatar, Banner, Row, SectionTitle, Stack, Text } from '@/components/ui'
import { HIT, color, radius, space } from '@/theme/tokens'
import { type SetupDraft, movePair, tapToPair, unpair, unpairedMembers } from '../../setup'
import { PAIR_JOINER } from '../../units'

export interface PairsEditorProps {
  draft: SetupDraft
  pending: string | null
  nameOf: (userId: string) => string
  onChange: (draft: SetupDraft, pending: string | null) => void
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed && styles.pressed, disabled && styles.disabled]}>
      <Ionicons name={icon} size={20} color={color.ink} />
    </Pressable>
  )
}

/** Tap two players to pair them; tap a pair to split it. In knockout the order is the seeding. */
export function PairsEditor({ draft, pending, nameOf, onChange }: PairsEditorProps) {
  const { t } = useTranslation('tournament')
  const knockout = draft.format === 'knockout'
  const unpaired = unpairedMembers(draft)
  const tap = (userId: string) => {
    const next = tapToPair(draft, pending, userId)
    onChange(next.draft, next.pending)
  }

  return (
    <Stack gap={8}>
      <SectionTitle>{knockout ? t('create.seedTitle') : t('create.pairsTitle')}</SectionTitle>
      <Text variant="caption" tone={color.inkMuted}>
        {knockout ? t('create.seedHelp') : t('create.pairHelp')}
      </Text>
      {draft.pairs.map((pair, i) => {
        const name = pair.map(nameOf).join(PAIR_JOINER)
        return (
          <Row key={pair.join('|')} gap={8} style={styles.pair}>
            {knockout ? (
              <Text variant="label" tone={color.accent} style={styles.seed}>
                {t('create.seed', { n: i + 1 })}
              </Text>
            ) : null}
            <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
              {name}
            </Text>
            {knockout ? (
              <>
                <IconButton
                  icon="arrow-up"
                  label={t('create.moveUp', { name })}
                  disabled={i === 0}
                  onPress={() => onChange(movePair(draft, i, -1), pending)}
                />
                <IconButton
                  icon="arrow-down"
                  label={t('create.moveDown', { name })}
                  disabled={i === draft.pairs.length - 1}
                  onPress={() => onChange(movePair(draft, i, 1), pending)}
                />
              </>
            ) : null}
            <IconButton icon="close" label={t('create.splitPair', { name })} onPress={() => onChange(unpair(draft, i), pending)} />
          </Row>
        )
      })}
      {pending ? <Banner tone="info">{t('create.holding', { name: nameOf(pending) })}</Banner> : null}
      {unpaired.length > 0 ? (
        <Text variant="caption" tone={color.warning}>
          {t('create.unpaired')}
        </Text>
      ) : null}
      <View style={styles.grid}>
        {unpaired.map((userId) => {
          const held = pending === userId
          return (
            <Pressable
              key={userId}
              accessibilityRole="button"
              accessibilityState={{ selected: held }}
              accessibilityLabel={nameOf(userId)}
              onPress={() => tap(userId)}
              style={({ pressed }) => [styles.unpaired, held && styles.held, pressed && styles.pressed]}>
              <Avatar name={nameOf(userId)} size={28} />
              <Text variant="label" tone={held ? color.onPrimary : color.ink} numberOfLines={1}>
                {nameOf(userId)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Stack>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { backgroundColor: color.raised, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: HIT },
  seed: { minWidth: 56 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unpaired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.warning,
    borderStyle: 'dashed',
  },
  held: { backgroundColor: color.primary, borderColor: color.primary, borderStyle: 'solid' },
})
