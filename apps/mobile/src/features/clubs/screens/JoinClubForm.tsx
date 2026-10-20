import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, TextInput, View } from 'react-native'
import { Button, Stack, Text } from '@/components/ui'
import { useAuthErrorText } from '@/features/auth/screens/useAuthErrorText'
import { color, font, radius, space } from '@/theme/tokens'
import { INVITE_LENGTH, isValidInviteCode, sanitizeCodeInput } from './inviteCode'
import { QrScanner } from './QrScanner'
import { useJoinClub } from './useClubActions'

export interface JoinClubFormProps {
  onJoined: (clubId: string) => void
  initialCode?: string
}

/** QR scanning needs the native camera module; the web build (iPhone home-screen app) types the code. */
const CAN_SCAN = Platform.OS !== 'web'

/** 6-character code field with a QR shortcut. Shared by club setup and the join modal. */
export function JoinClubForm({ onJoined, initialCode = '' }: JoinClubFormProps) {
  const { t } = useTranslation('auth')
  const errorText = useAuthErrorText()
  const [code, setCode] = useState(() => sanitizeCodeInput(initialCode))
  const [scanning, setScanning] = useState(false)
  const join = useJoinClub(onJoined)
  const valid = isValidInviteCode(code)

  const submit = (value: string): void => {
    if (isValidInviteCode(value) && !join.isPending) join.mutate(value)
  }

  return (
    <Stack gap={space.lg}>
      <Stack gap={space.xs}>
        <Text variant="label" tone={color.inkMuted}>
          {t('club.codeLabel')}
        </Text>
        <TextInput
          value={code}
          onChangeText={(v) => {
            setCode(sanitizeCodeInput(v))
            join.reset()
          }}
          placeholder="ABC234"
          placeholderTextColor={color.inkFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={INVITE_LENGTH + 4}
          returnKeyType="go"
          onSubmitEditing={() => submit(code)}
          accessibilityLabel={t('club.codeLabel')}
          selectionColor={color.teamA}
          style={[styles.code, join.error ? styles.codeError : null]}
        />
        <Text variant="caption" tone={join.error ? color.danger : color.inkFaint} accessibilityRole={join.error ? 'alert' : undefined}>
          {join.error ? errorText(join.error) : t('club.codeHint')}
        </Text>
      </Stack>
      <Button label={t('club.join')} size="lg" block disabled={!valid} loading={join.isPending} onPress={() => submit(code)} />
      {CAN_SCAN ? (
        <>
          <View style={styles.or}>
            <View style={styles.rule} />
            <Text variant="caption" tone={color.inkFaint}>
              {t('signIn.or')}
            </Text>
            <View style={styles.rule} />
          </View>
          <Button
            label={t('club.scan')}
            variant="secondary"
            block
            icon={<Ionicons name="qr-code-outline" size={20} color={color.ink} />}
            disabled={join.isPending}
            onPress={() => setScanning(true)}
          />
          <QrScanner
            visible={scanning}
            onClose={() => setScanning(false)}
            onCode={(scanned) => {
              setScanning(false)
              setCode(scanned)
              submit(scanned)
            }}
          />
        </>
      ) : null}
    </Stack>
  )
}

const styles = StyleSheet.create({
  code: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.sunken,
    color: color.ink,
    fontFamily: font.score,
    fontSize: 40,
    letterSpacing: 10,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  codeError: { borderColor: color.danger },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.line },
})
