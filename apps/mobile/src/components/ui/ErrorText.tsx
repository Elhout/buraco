import { useTranslation } from 'react-i18next'
import { toAppError } from '@/lib/errors'
import { color } from '@/theme/tokens'
import { Text } from './Text'

/** Translates any thrown error into a user-friendly sentence (common:errors.*). */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => t(`errors.${toAppError(error).code}`)
}

export function ErrorText({ error }: { error: unknown }) {
  const text = useErrorText()
  if (!error) return null
  return (
    <Text variant="label" tone={color.danger} accessibilityRole="alert">
      {text(error)}
    </Text>
  )
}
