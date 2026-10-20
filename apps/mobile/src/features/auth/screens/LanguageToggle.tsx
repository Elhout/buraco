import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui'
import { type Lang } from '@/i18n'

export interface LanguageToggleProps {
  value: Lang
  onChange: (lang: Lang) => void
}

/** EN / عربي switch. Each option is labelled in its own language so anyone can find theirs. */
export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  const { t } = useTranslation('auth')
  const options = [
    { value: 'en', label: t('language.en') },
    { value: 'ar', label: t('language.ar') },
  ] as const
  return <Segmented<Lang> value={value} options={options} onChange={onChange} />
}
