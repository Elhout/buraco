import { useTranslation } from 'react-i18next'
import { useErrorText } from '@/components/ui'
import { authErrorKey } from '../authErrors'

/** Auth-specific messages (wrong password, rate limit, taken username) first, then the common mapping. */
export function useAuthErrorText(): (error: unknown) => string {
  const { t } = useTranslation('auth')
  const common = useErrorText()
  return (error) => {
    const key = authErrorKey(error)
    return key ? t(`errors.${key}`) : common(error)
  }
}
