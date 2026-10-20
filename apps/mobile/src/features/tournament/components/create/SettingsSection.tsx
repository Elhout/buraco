import { useTranslation } from 'react-i18next'
import { Field, Row, SectionTitle, Segmented, Stack, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { color } from '@/theme/tokens'
import { type SetupDraft, isoDay } from '../../setup'
import type { TournamentFormat, TournamentPairing } from '../../types'
import { Chip } from '../Chip'

const FORMATS: readonly TournamentFormat[] = ['round_robin', 'swiss', 'knockout']
const PAIRINGS: readonly TournamentPairing[] = ['fixed', 'rotating']
const MINUTE_CHIPS = [30, 45, 60] as const
const TARGET_CHIPS = [1500, 2000] as const

export interface SettingsSectionProps {
  draft: SetupDraft
  clubTarget: number
  onChange: (patch: Partial<SetupDraft>) => void
}

const tomorrow = (): string => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return isoDay(d)
}

/** Name, date, format, partnership, round length and target. */
export function SettingsSection({ draft, clubTarget, onChange }: SettingsSectionProps) {
  const { t } = useTranslation('tournament')
  const targets = [...new Set([...TARGET_CHIPS, clubTarget])].sort((a, b) => a - b)
  return (
    <Stack gap={16}>
      <Field
        label={t('create.name')}
        value={draft.name}
        onChangeText={(name) => onChange({ name })}
        placeholder={t('create.namePlaceholder')}
        maxLength={80}
        autoFocus
      />
      <Stack gap={8}>
        <Field
          label={t('create.date')}
          value={draft.startsOn}
          onChangeText={(startsOn) => onChange({ startsOn })}
          keyboardType="numbers-and-punctuation"
        />
        <Row gap={8}>
          <Chip
            label={t('create.today')}
            selected={draft.startsOn === isoDay(new Date())}
            onPress={() => onChange({ startsOn: isoDay(new Date()) })}
          />
          <Chip label={t('create.tomorrow')} selected={draft.startsOn === tomorrow()} onPress={() => onChange({ startsOn: tomorrow() })} />
        </Row>
      </Stack>

      <SectionTitle>{t('create.format')}</SectionTitle>
      <Segmented
        value={draft.format}
        options={FORMATS.map((f) => ({ value: f, label: t(`format.${f}`) }))}
        onChange={(format) => onChange({ format })}
      />
      <Text variant="caption" tone={color.inkMuted}>
        {t(`formatHint.${draft.format}`)}
      </Text>

      <SectionTitle>{t('create.pairing')}</SectionTitle>
      <Segmented
        value={draft.pairing}
        options={PAIRINGS.map((p) => ({ value: p, label: t(`pairing.${p}`) }))}
        onChange={(pairing) => onChange({ pairing })}
      />
      <Text variant="caption" tone={color.inkMuted}>
        {t(`pairingHint.${draft.pairing}`)}
      </Text>

      <Stack gap={8}>
        <Field
          label={t('create.roundMinutes')}
          value={draft.roundMinutes}
          onChangeText={(roundMinutes) => onChange({ roundMinutes })}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Row gap={8}>
          {MINUTE_CHIPS.map((m) => (
            <Chip
              key={m}
              label={t('minutes', { count: m })}
              selected={draft.roundMinutes === String(m)}
              onPress={() => onChange({ roundMinutes: String(m) })}
            />
          ))}
        </Row>
      </Stack>

      <Stack gap={8}>
        <Field
          label={t('create.target')}
          value={draft.target}
          onChangeText={(target) => onChange({ target })}
          keyboardType="number-pad"
          maxLength={5}
          hint={t('create.targetHint', { points: formatNumber(clubTarget) })}
        />
        <Row gap={8}>
          {targets.map((p) => (
            <Chip key={p} label={formatNumber(p)} selected={draft.target === String(p)} onPress={() => onChange({ target: String(p) })} />
          ))}
        </Row>
      </Stack>
    </Stack>
  )
}
