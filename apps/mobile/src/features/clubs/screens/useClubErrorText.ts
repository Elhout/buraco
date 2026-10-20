import { useTranslation } from 'react-i18next'
import { useErrorText } from '@/components/ui'
import { clubErrorKey } from './clubErrors'

/** Club-management messages (owner only, not allowed, member gone) first, then the common mapping. */
export function useClubErrorText(): (error: unknown) => string {
  const { t } = useTranslation('profile')
  const common = useErrorText()
  return (error) => {
    const key = clubErrorKey(error)
    return key ? t(`clubErrors.${key}`) : common(error)
  }
}
