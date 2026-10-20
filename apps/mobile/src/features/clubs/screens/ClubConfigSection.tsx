import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Switch, View } from 'react-native'
import { Button, Card, Field, ListRow, Row, Stack, Text } from '@/components/ui'
import { type Club, useClubs } from '@/features/clubs/ClubProvider'
import i18n from '@/i18n'
import { formatDate, formatNumber } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { color, space } from '@/theme/tokens'
import { CLUB_NAME_MAX, type ClubDraft, type ClubErrors, draftFromClub, isDraftDirty, todayIso, validateClubDraft } from './settingsForm'
import { useClubErrorText } from './useClubErrorText'

export interface ClubConfigSectionProps {
  club: Club
  canEdit: boolean
}

/** Scoring config and season. Owners/admins edit; members see the values. New games snapshot them. */
export function ClubConfigSection({ club, canEdit }: ClubConfigSectionProps) {
  return canEdit ? <ConfigForm key={club.id} club={club} /> : <ConfigReadOnly club={club} />
}

function ConfigReadOnly({ club }: { club: Club }) {
  const { t } = useTranslation('profile')
  const yesNo = (v: boolean): string => (v ? t('clubSettings.yes') : t('clubSettings.no'))
  return (
    <Card>
      <ListRow title={t('clubSettings.target')} trailing={<Value text={formatNumber(club.target_score)} />} />
      <ListRow title={t('clubSettings.cutBonus')} trailing={<Value text={`+${formatNumber(club.cut_bonus)}`} />} />
      <ListRow title={t('clubSettings.allowNegative')} trailing={<Value text={yesNo(club.allow_negative)} />} />
      <ListRow
        title={t('clubSettings.seasonStart')}
        trailing={<Value text={club.season_start ? formatDate(club.season_start, i18n.language) : t('clubSettings.noSeason')} />}
      />
      <Text variant="caption" tone={color.inkFaint}>
        {t('clubSettings.readOnlyNote')}
      </Text>
    </Card>
  )
}

const Value = ({ text }: { text: string }) => (
  <Text variant="bodyStrong" tone={color.ink}>
    {text}
  </Text>
)

function ConfigForm({ club }: { club: Club }) {
  const { t } = useTranslation('profile')
  const { refresh } = useClubs()
  const errorText = useClubErrorText()
  const [draft, setDraft] = useState<ClubDraft>(() => draftFromClub(club))
  const [saved, setSaved] = useState(false)
  const result = validateClubDraft(draft)
  const errors: ClubErrors = result.ok ? {} : result.errors
  const dirty = isDraftDirty(draft, club)

  const save = useMutation({
    mutationFn: async () => {
      if (!result.ok) return
      const { error } = await supabase.from('clubs').update(result.value).eq('id', club.id)
      if (error) throw error
      await refresh()
    },
    onSuccess: () => setSaved(true),
  })
  const edit = (patch: Partial<ClubDraft>): void => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
    save.reset()
  }

  return (
    <Card>
      <Field
        label={t('clubSettings.name')}
        value={draft.name}
        onChangeText={(name) => edit({ name })}
        maxLength={CLUB_NAME_MAX + 5}
        error={errors.name ? t(`clubSettings.error_${errors.name}`, { max: CLUB_NAME_MAX }) : null}
      />
      <RuleFields draft={draft} errors={errors} onEdit={edit} />
      <SeasonField
        value={draft.seasonStart}
        error={errors.seasonStart ? t('clubSettings.dateInvalid') : null}
        onChange={(seasonStart) => edit({ seasonStart })}
      />
      <Text variant="caption" tone={color.inkFaint}>
        {t('clubSettings.snapshotNote')}
      </Text>
      {save.error ? (
        <Text variant="label" tone={color.danger} accessibilityRole="alert">
          {errorText(save.error)}
        </Text>
      ) : null}
      <Button
        label={saved && !dirty ? t('clubSettings.saved') : t('clubSettings.save')}
        block
        disabled={!dirty || !result.ok}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Card>
  )
}

interface RuleFieldsProps {
  draft: ClubDraft
  errors: ClubErrors
  onEdit: (patch: Partial<ClubDraft>) => void
}

function RuleFields({ draft, errors, onEdit }: RuleFieldsProps) {
  const { t } = useTranslation('profile')
  const edit = onEdit
  return (
    <>
      <Row gap={space.md}>
        <View style={styles.flex}>
          <Field
            label={t('clubSettings.target')}
            value={draft.target}
            onChangeText={(target) => edit({ target })}
            keyboardType="number-pad"
            maxLength={6}
            error={errors.target ? t('clubSettings.targetRange') : null}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={t('clubSettings.cutBonus')}
            value={draft.cutBonus}
            onChangeText={(cutBonus) => edit({ cutBonus })}
            keyboardType="number-pad"
            maxLength={5}
            error={errors.cutBonus ? t('clubSettings.cutRange') : null}
          />
        </View>
      </Row>
      <Row gap={space.md} style={styles.switchRow}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{t('clubSettings.allowNegative')}</Text>
          <Text variant="caption" tone={color.inkMuted}>
            {t('clubSettings.allowNegativeHint')}
          </Text>
        </View>
        <Switch
          value={draft.allowNegative}
          onValueChange={(allowNegative) => edit({ allowNegative })}
          trackColor={{ false: color.line, true: color.teamA }}
          thumbColor="#FFFFFF"
          accessibilityLabel={t('clubSettings.allowNegative')}
        />
      </Row>
    </>
  )
}

interface SeasonFieldProps {
  value: string
  error: string | null
  onChange: (value: string) => void
}

/** YYYY-MM-DD with shortcuts; no date-picker dependency is installed. */
function SeasonField({ value, error, onChange }: SeasonFieldProps) {
  const { t } = useTranslation('profile')
  return (
    <Stack gap={space.xs}>
      <Field
        label={t('clubSettings.seasonStart')}
        value={value}
        onChangeText={onChange}
        placeholder="2026-09-01"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={error}
        hint={t('clubSettings.seasonHint')}
      />
      <Row gap={space.sm}>
        <Button label={t('clubSettings.seasonToday')} variant="secondary" onPress={() => onChange(todayIso())} />
        {value ? <Button label={t('clubSettings.seasonClear')} variant="quiet" onPress={() => onChange('')} /> : null}
      </Row>
    </Stack>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switchRow: { minHeight: 56 },
})
