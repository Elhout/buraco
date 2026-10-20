import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Field, type FieldProps, Text } from '@/components/ui'
import { color, space } from '@/theme/tokens'

/** Password input with a show/hide toggle. Passwords are typed left-to-right in both languages. */
export function PasswordField(props: Omit<FieldProps, 'secureTextEntry'>) {
  const { t } = useTranslation('auth')
  const [visible, setVisible] = useState(false)
  return (
    <View style={styles.wrap}>
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType="password"
        autoComplete="current-password"
        {...props}
        secureTextEntry={!visible}
        style={[styles.ltr, props.style]}
      />
      <Text variant="label" tone={color.teamB} accessibilityRole="button" onPress={() => setVisible((v) => !v)} style={styles.toggle}>
        {visible ? t('password.hide') : t('password.show')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  ltr: { writingDirection: 'ltr' },
  toggle: { alignSelf: 'flex-end', paddingVertical: space.xs },
})
