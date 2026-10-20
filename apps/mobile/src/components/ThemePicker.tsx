import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui'
import { type ThemePreference, setThemePreference, themePreference } from '@/theme/scheme'

/** System / Light / Dark. Changing the colours restarts the app, like switching language. */
export function ThemePicker() {
  const { t } = useTranslation()
  const [value, setValue] = useState<ThemePreference>(themePreference)
  return (
    <Segmented<ThemePreference>
      value={value}
      options={[
        { value: 'system', label: t('theme.system') },
        { value: 'light', label: t('theme.light') },
        { value: 'dark', label: t('theme.dark') },
      ]}
      onChange={(next) => {
        setValue(next)
        void setThemePreference(next)
      }}
    />
  )
}
