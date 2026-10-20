import type { Team } from '@buraco/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Segmented, Sheet, Stack } from '@/components/ui'
import { digitsOnly } from '@/lib/digits'
import { formatNumber } from '@/lib/format'
import { space } from '@/theme/tokens'
import { TARGET_MAX, TARGET_MIN, TARGET_PRESETS, TEAM_NAME_MAX, isValidTarget } from './model'

/** Rename a team. Mounted only while open, so it starts from the current name. */
export function RenameSheet({
  team,
  name,
  onSave,
  onClose,
}: {
  team: Team
  name: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation('quick')
  const [value, setValue] = useState(name)
  return (
    <Sheet visible onClose={onClose} title={t('renameTitle', { team })}>
      <Stack gap={space.md}>
        <Field
          label={t('nameLabel')}
          value={value}
          onChangeText={setValue}
          placeholder={t('team', { team })}
          hint={t('nameHint', { team })}
          maxLength={TEAM_NAME_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => onSave(value)}
        />
        <Button label={t('save')} size="lg" block onPress={() => onSave(value)} />
      </Stack>
    </Sheet>
  )
}

type TargetChoice = `${(typeof TARGET_PRESETS)[number]}` | 'custom'

/** Target picker: the usual presets or any whole number in range. */
export function TargetSheet({ target, onSave, onClose }: { target: number; onSave: (target: number) => void; onClose: () => void }) {
  const { t } = useTranslation('quick')
  const preset = TARGET_PRESETS.find((p) => p === target)
  const [choice, setChoice] = useState<TargetChoice>(preset ? `${preset}` : 'custom')
  const [custom, setCustom] = useState(preset ? '' : String(target))
  const [touched, setTouched] = useState(false)
  const value = choice === 'custom' ? Number.parseInt(custom, 10) : Number(choice)
  const valid = isValidTarget(value)
  const options: { value: TargetChoice; label: string }[] = [
    ...TARGET_PRESETS.map((p) => ({ value: `${p}` as TargetChoice, label: formatNumber(p) })),
    { value: 'custom', label: t('targetCustom') },
  ]
  const save = (): void => {
    setTouched(true)
    if (valid) onSave(value)
  }
  return (
    <Sheet visible onClose={onClose} title={t('targetTitle')} subtitle={t('targetSubtitle')}>
      <Stack gap={space.md}>
        <Segmented value={choice} options={options} onChange={setChoice} />
        {choice === 'custom' ? (
          <Field
            label={t('targetLabel')}
            value={custom}
            onChangeText={(v) => setCustom(digitsOnly(v).slice(0, 5))}
            keyboardType="number-pad"
            autoFocus
            error={touched && !valid ? t('targetInvalid', { min: formatNumber(TARGET_MIN), max: formatNumber(TARGET_MAX) }) : null}
            onSubmitEditing={save}
          />
        ) : null}
        <Button label={t('save')} size="lg" block onPress={save} />
      </Stack>
    </Sheet>
  )
}

/** "Start a new game?": scores cleared, names and target kept. */
export function NewGameSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation(['quick', 'common'])
  return (
    <Sheet visible onClose={onClose} title={t('newGameTitle')} subtitle={t('newGameBody')}>
      <Stack gap={space.md}>
        <Button label={t('newGameConfirm')} variant="danger" size="lg" block onPress={onConfirm} />
        <Button label={t('common:actions.cancel')} variant="quiet" block onPress={onClose} />
      </Stack>
    </Sheet>
  )
}
