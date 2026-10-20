import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Banner, Button, EmptyState, ErrorText, Screen, Stack } from '@/components/ui'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { useCreateTournament } from '@/features/tournament/actions'
import { EntrantsSection } from '@/features/tournament/components/create/EntrantsSection'
import { SettingsSection } from '@/features/tournament/components/create/SettingsSection'
import { type SetupDraft, buildCreateArgs, buildEntries, emptyDraft, isoDay, validateDraft } from '@/features/tournament/setup'
import { color, space } from '@/theme/tokens'

/** Create a tournament (owners and admins): settings, entrants, pairs or ghost seats, seeds. */
export default function NewTournamentScreen() {
  const { t } = useTranslation(['tournament', 'common'])
  const { club, role } = useCurrentClub()
  const members = useClubMembers(club.id)
  const create = useCreateTournament(club.id)
  const [draft, setDraft] = useState<SetupDraft>(() => emptyDraft(isoDay(new Date()), club.target_score))
  const [pending, setPending] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const check = validateDraft(draft)

  if (role !== 'owner' && role !== 'admin') {
    return (
      <Screen title={t('create.title')}>
        <EmptyState icon="lock-closed-outline" title={t('common:errors.organizerAdminOnly')} />
      </Screen>
    )
  }

  const submit = () => {
    setAttempted(true)
    if (check.errors.length > 0) return
    create.mutate(
      { args: buildCreateArgs(draft, club.id), entries: buildEntries(draft) },
      { onSuccess: (id) => router.replace(`/tournaments/${id}`) },
    )
  }

  return (
    <Screen
      title={t('create.title')}
      subtitle={club.name}
      actions={<Button variant="quiet" label={t('common:actions.cancel')} onPress={() => router.back()} />}
      footer={
        <View style={styles.footer}>
          {attempted && check.errors.length > 0 ? <Banner tone="danger">{t('create.fixProblems')}</Banner> : null}
          <ErrorText error={create.error} />
          <Button label={t('create.submit')} size="lg" block loading={create.isPending} onPress={submit} />
        </View>
      }>
      <SettingsSection
        draft={draft}
        clubTarget={club.target_score}
        onChange={(patch) => {
          setDraft((d) => ({ ...d, ...patch }))
          if (patch.pairing) setPending(null)
        }}
      />
      <EntrantsSection
        draft={draft}
        pending={pending}
        members={members.members}
        loading={members.isPending}
        nameOf={members.nameOf}
        onChange={(next, nextPending) => {
          setDraft(next)
          setPending(nextPending)
        }}
      />
      <Stack gap={8}>
        {check.warnings.map((w) => (
          <Banner key={w} tone="warning">
            {t(`warning.${w}`)}
          </Banner>
        ))}
        {attempted
          ? check.errors.map((e) => (
              <Banner key={e} tone="danger">
                {t(`error.${e}`)}
              </Banner>
            ))
          : null}
      </Stack>
    </Screen>
  )
}

const styles = StyleSheet.create({
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
})
