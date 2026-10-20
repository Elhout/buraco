import { loginEmail, validateUsername } from '@buraco/shared'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Field, Screen, Stack, Text } from '@/components/ui'
import i18n, { type Lang, setLanguage } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { color, font, space } from '@/theme/tokens'
import { LanguageToggle } from './LanguageToggle'
import { PasswordField } from './PasswordField'
import { useAuthErrorText } from './useAuthErrorText'

/**
 * Username and password, both given by a club admin. The session is stored on the phone and
 * refreshed automatically, so players sign in once and stay signed in.
 */
export function SignInScreen() {
  const { t } = useTranslation('auth')
  const { t: tq } = useTranslation('quick')
  const errorText = useAuthErrorText()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signIn = async (): Promise<void> => {
    const parsed = validateUsername(username)
    if (!parsed.ok) {
      setProblem(t(parsed.problem === 'empty' ? 'signIn.emptyUsername' : 'errors.wrongPassword'))
      return
    }
    if (password.length === 0) {
      setProblem(t('signIn.emptyPassword'))
      return
    }
    setBusy(true)
    setProblem(null)
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(parsed.username), password })
    setBusy(false)
    // On success the session stage changes and the root guard moves on by itself.
    if (error) setProblem(errorText(error))
  }

  const clear = (): void => setProblem(null)

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.top}>
        <LanguageToggle value={i18n.language as Lang} onChange={(lang) => void setLanguage(lang)} />
      </View>
      <View style={styles.hero}>
        <View style={styles.suits} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.suit, { color: color.teamA }]}>♦</Text>
          <Text style={[styles.suit, { color: color.ink }]}>♠</Text>
          <Text style={[styles.suit, { color: color.teamB }]}>♣</Text>
        </View>
        <Text variant="display" accessibilityRole="header">
          {t('signIn.title')}
        </Text>
        <Text variant="body" tone={color.inkMuted}>
          {t('signIn.subtitle')}
        </Text>
      </View>
      <Stack gap={space.lg}>
        <Field
          label={t('signIn.usernameLabel')}
          value={username}
          onChangeText={(v) => {
            setUsername(v)
            clear()
          }}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          style={styles.ltr}
        />
        <PasswordField
          label={t('signIn.passwordLabel')}
          value={password}
          onChangeText={(v) => {
            setPassword(v)
            clear()
          }}
          returnKeyType="go"
          onSubmitEditing={() => void signIn()}
          error={problem}
        />
        <Button label={t('signIn.submit')} size="lg" block loading={busy} onPress={() => void signIn()} />
      </Stack>
      <View style={styles.or}>
        <View style={styles.rule} />
        <Text variant="caption" tone={color.inkFaint}>
          {t('signIn.or')}
        </Text>
        <View style={styles.rule} />
      </View>
      <Button
        label={tq('entry')}
        variant="secondary"
        size="lg"
        block
        icon={<Ionicons name="flash-outline" size={20} color={color.ink} />}
        onPress={() => router.push('/quick')}
      />
      <Text variant="caption" tone={color.inkFaint} center>
        {t('signIn.help')}
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.xl, paddingTop: space.md },
  top: { alignSelf: 'flex-end', width: 200 },
  hero: { gap: space.sm, marginTop: space.xl },
  suits: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  suit: { fontFamily: font.score, fontSize: 40, lineHeight: 44 },
  ltr: { writingDirection: 'ltr' },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.line },
})
