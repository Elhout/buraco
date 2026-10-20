import { useTranslation } from 'react-i18next'
import { Card, SectionTitle, Stack, Text } from '@/components/ui'
import { ThemePicker } from '@/components/ThemePicker'
import { color } from '@/theme/tokens'

/** Light or dark colours; "System" follows the phone's setting. */
export function AppearanceSection() {
  const { t } = useTranslation()
  return (
    <Stack>
      <SectionTitle>{t('theme.section')}</SectionTitle>
      <Card>
        <ThemePicker />
        <Text variant="caption" tone={color.inkFaint}>
          {t('theme.hint')}
        </Text>
      </Card>
    </Stack>
  )
}
