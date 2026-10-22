import type { Enums } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { color, radius, space } from '@/theme/tokens'

type Role = Enums<'club_role'>

const TONE: Record<Role, { bg: string; fg: string }> = {
  owner: { bg: color.warningSoft, fg: color.accent },
  admin: { bg: color.raised, fg: color.ink },
  member: { bg: color.raised, fg: color.inkMuted },
}

export function RoleChip({ role }: { role: Role }) {
  const { t } = useTranslation('profile')
  const tone = TONE[role]
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text variant="caption" tone={tone.fg}>
        {t(`roles.${role}`)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill },
})
