import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Button, Card, EmptyState, ErrorText, ListRow, SectionTitle, Stack } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import i18n from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { color } from '@/theme/tokens'

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  ios: 'phone-portrait-outline',
  android: 'phone-portrait-outline',
  web: 'desktop-outline',
}

/** Phones registered for push (RLS: only my own rows). Signing out on a phone removes it. */
export function DevicesSection() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const userId = useUserId()
  const devices = useQuery({
    queryKey: qk.devices(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('id, platform, app_state, last_seen')
        .eq('user_id', userId)
        .order('last_seen', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const body = (() => {
    if (devices.isPending) return <ActivityIndicator color={color.ink} accessibilityLabel={tc('loading')} />
    if (devices.isError) {
      return (
        <Stack>
          <ErrorText error={devices.error} />
          <Button label={tc('actions.retry')} variant="secondary" onPress={() => void devices.refetch()} />
        </Stack>
      )
    }
    if (devices.data.length === 0)
      return <EmptyState icon="phone-portrait-outline" title={t('devices.empty')} body={t('devices.emptyBody')} />
    return devices.data.map((d) => (
      <ListRow
        key={d.id}
        title={t(`devices.platform_${d.platform === 'ios' || d.platform === 'android' ? d.platform : 'web'}`)}
        subtitle={t('devices.lastSeen', { time: formatDateTime(d.last_seen, i18n.language) })}
        leading={
          <Ionicons
            name={ICON[d.platform] ?? 'phone-portrait-outline'}
            size={22}
            color={d.app_state === 'active' ? color.success : color.inkMuted}
          />
        }
      />
    ))
  })()

  return (
    <Stack>
      <SectionTitle>{t('devices.section')}</SectionTitle>
      <Card>{body}</Card>
    </Stack>
  )
}
