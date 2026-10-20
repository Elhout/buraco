import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Switch } from 'react-native'
import { Card, ErrorText, ListRow, SectionTitle, Stack } from '@/components/ui'
import type { Profile } from '@/features/auth/SessionProvider'
import { color } from '@/theme/tokens'
import { useUpdateProfile } from './useUpdateProfile'
import { WebPushCard } from './WebPushCard'

type Toggle = 'notify_game_started' | 'notify_tournament'

/** Spec: game-started and tournament pushes are per-user opt-outs. Invites and confirmations always arrive. */
export function NotificationsSection({ profile }: { profile: Profile }) {
  const { t } = useTranslation('profile')
  const update = useUpdateProfile()
  // Optimistic: show the pending value while saving.
  const value = (key: Toggle): boolean =>
    update.isPending && update.variables?.[key] !== undefined ? Boolean(update.variables[key]) : profile[key]

  const row = (key: Toggle, icon: keyof typeof Ionicons.glyphMap) => (
    <ListRow
      title={t(`notifications.${key}`)}
      subtitle={t(`notifications.${key}_hint`)}
      leading={<Ionicons name={icon} size={22} color={color.inkMuted} />}
      trailing={
        <Switch
          value={value(key)}
          disabled={update.isPending}
          onValueChange={(on) => update.mutate({ [key]: on })}
          trackColor={{ false: color.line, true: color.teamA }}
          thumbColor={color.ivory}
          accessibilityLabel={t(`notifications.${key}`)}
        />
      }
    />
  )

  return (
    <Stack>
      <SectionTitle>{t('notifications.section')}</SectionTitle>
      <WebPushCard />
      <Card>
        {row('notify_game_started', 'play-circle-outline')}
        {row('notify_tournament', 'trophy-outline')}
        <ErrorText error={update.error} />
      </Card>
    </Stack>
  )
}
