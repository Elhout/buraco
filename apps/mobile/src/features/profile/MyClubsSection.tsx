import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Card, ListRow, Row, SectionTitle, Stack, Text } from '@/components/ui'
import { type MyClub, useClubs } from '@/features/clubs/ClubProvider'
import { RoleChip } from '@/features/clubs/screens/RoleChip'
import { color, space } from '@/theme/tokens'
import { LeaveClubSheet } from './LeaveClubSheet'

/** Clubs I belong to: switch the current one, open settings, join another, leave. */
export function MyClubsSection() {
  const { t } = useTranslation('profile')
  const { clubs, current, select } = useClubs()
  const [leaving, setLeaving] = useState<MyClub | null>(null)

  return (
    <Stack>
      <SectionTitle action={<Button label={t('clubs.join')} variant="quiet" onPress={() => router.push('/club/join')} />}>
        {t('clubs.section')}
      </SectionTitle>
      <Card>
        {clubs.map((c) => {
          const isCurrent = c.club.id === current?.club.id
          return (
            <View key={c.club.id} style={styles.club}>
              <ListRow
                title={c.club.name}
                subtitle={isCurrent ? t('clubs.current') : t('clubs.tapToSwitch')}
                leading={
                  <Ionicons
                    name={isCurrent ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={isCurrent ? color.teamA : color.inkFaint}
                  />
                }
                trailing={<RoleChip role={c.role} />}
                onPress={isCurrent ? undefined : () => select(c.club.id)}
              />
              <Row gap={space.sm} style={styles.actions}>
                {isCurrent ? (
                  <Button label={t('clubs.settings')} variant="secondary" onPress={() => router.push('/club/settings')} />
                ) : null}
                <Button label={t('clubs.leave')} variant="quiet" onPress={() => setLeaving(c)} />
              </Row>
            </View>
          )
        })}
        {clubs.length === 0 ? <Text tone={color.inkMuted}>{t('clubs.none')}</Text> : null}
      </Card>
      <LeaveClubSheet club={leaving} onClose={() => setLeaving(null)} />
    </Stack>
  )
}

const styles = StyleSheet.create({
  club: { gap: space.xs, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  actions: { justifyContent: 'flex-end' },
})
