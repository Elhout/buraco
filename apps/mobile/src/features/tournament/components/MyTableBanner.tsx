import { type Href, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from '@/components/ui'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import type { MyTable } from '../model'
import { joinNames } from '../units'

export interface MyTableBannerProps {
  table: MyTable
  href: string | null
}

/** "Round 3, Table 2: you and X vs Y and Z" — the same sentence as the table-assignment push. */
export function MyTableBanner({ table, href }: MyTableBannerProps) {
  const { t } = useTranslation(['tournament', 'common'])
  const text = t('detail.myTable', {
    round: table.roundNo,
    table: table.tableNo,
    partner: table.partner,
    opponents: joinNames(table.opponents, t('common:and')),
  })
  return (
    <View style={[styles.box, { backgroundColor: teamSoft(table.team), borderColor: teamColor(table.team) }]} accessibilityRole="summary">
      <Text variant="bodyStrong">{text}</Text>
      {href ? (
        <Button
          variant={table.team === 'A' ? 'teamA' : 'teamB'}
          label={t('detail.openMyTable')}
          onPress={() => router.push(href as Href)}
        />
      ) : null}
    </View>
  )
}

export function ByeBanner({ roundNo }: { roundNo: number }) {
  const { t } = useTranslation('tournament')
  return (
    <View style={[styles.box, { borderColor: color.lineStrong }]}>
      <Text variant="bodyStrong">{t('detail.myBye', { round: roundNo })}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.md },
})
