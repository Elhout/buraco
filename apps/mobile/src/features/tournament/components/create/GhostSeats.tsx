import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ListRow, Stack } from '@/components/ui'
import { color } from '@/theme/tokens'
import { type SetupDraft, addGhost, ghostsNeeded, removeGhost } from '../../setup'

/** Rotating partners: ghost seats fill the last table to a multiple of 4. */
export function GhostSeats({ draft, onChange }: { draft: SetupDraft; onChange: (draft: SetupDraft) => void }) {
  const { t } = useTranslation(['tournament', 'common'])
  const needed = ghostsNeeded(draft)
  return (
    <Stack gap={8}>
      {draft.ghosts.map((name, i) => (
        <ListRow
          key={`${name}-${i}`}
          title={name}
          leading={<Ionicons name="eye-off-outline" size={22} color={color.ghost} />}
          trailing={
            <Button
              variant="quiet"
              label={t('common:actions.remove')}
              accessibilityLabel={t('create.removeGhost', { name })}
              onPress={() => onChange(removeGhost(draft, i))}
            />
          }
        />
      ))}
      {needed > 0 && draft.selected.length > 0 ? (
        <Banner
          tone="ghost"
          action={
            <Button
              variant="secondary"
              label={t('create.addGhost')}
              onPress={() => onChange(addGhost(draft, t('create.ghost', { n: draft.ghosts.length + 1 })))}
            />
          }>
          {t('create.ghostsNeeded', { count: needed })}
        </Banner>
      ) : null}
    </Stack>
  )
}
