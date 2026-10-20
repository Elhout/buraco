import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, StyleSheet, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Button, Card, Row, Text } from '@/components/ui'
import type { Club } from '@/features/clubs/ClubProvider'
import { color, font, radius, space } from '@/theme/tokens'
import { inviteLink, spacedCode } from './inviteCode'
import { RotateCodeSheet } from './RotateCodeSheet'

export interface InviteCardProps {
  club: Club
  isOwner: boolean
}

const COPIED_MS = 2000

/** Everyone can invite: QR (scanned in the app), the code to read aloud, copy and share. */
export function InviteCard({ club, isOwner }: InviteCardProps) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)
  const link = inviteLink(club.invite_code)

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(club.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_MS)
  }

  const share = (): void => {
    void Share.share({ message: t('clubSettings.shareMessage', { club: club.name, code: club.invite_code, link }) }).catch(() => undefined)
  }

  return (
    <Card tone="raised" style={styles.card}>
      <View style={styles.qr} accessibilityRole="image" accessibilityLabel={t('clubSettings.qrLabel')}>
        <QRCode value={link} size={188} color={color.inkOnLight} backgroundColor={color.ivory} quietZone={12} />
      </View>
      <View style={styles.codeBlock}>
        <Text variant="caption" tone={color.inkMuted} center>
          {t('clubSettings.inviteCode')}
        </Text>
        <Text variant="score" center style={styles.code} accessibilityLabel={[...club.invite_code].join(' ')} selectable>
          {spacedCode(club.invite_code)}
        </Text>
      </View>
      <Row gap={space.sm}>
        <View style={styles.flex}>
          <Button
            label={copied ? tc('actions.copied') : tc('actions.copy')}
            variant="secondary"
            block
            icon={<Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={color.ink} />}
            onPress={() => void copy()}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={tc('actions.share')}
            block
            icon={<Ionicons name="share-outline" size={18} color={color.inkOnLight} />}
            onPress={share}
          />
        </View>
      </Row>
      {isOwner ? (
        <>
          <Button label={t('clubSettings.rotate')} variant="quiet" onPress={() => setRotating(true)} />
          <RotateCodeSheet clubId={club.id} visible={rotating} onClose={() => setRotating(false)} />
        </>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'stretch', gap: space.lg },
  qr: { alignSelf: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: color.ivory },
  codeBlock: { gap: space.xxs },
  code: { fontFamily: font.score, letterSpacing: 6, writingDirection: 'ltr' },
  flex: { flex: 1 },
})
