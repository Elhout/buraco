import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Card, Row, Text } from '@/components/ui'
import type { GameView } from '@/features/game/model'
import { formatDateTime, formatNumber } from '@/lib/format'
import { color, radius, space } from '@/theme/tokens'
import { useGameEvents } from '../api'
import { type EventContext, type EventTone, describeEvent } from '../events'
import { ErrorBlock, LoadingBlock } from '../ui'

const toneColor: Record<EventTone, string> = {
  neutral: color.inkFaint,
  success: color.success,
  danger: color.danger,
  warning: color.warning,
  ghost: color.ghost,
}

export interface AuditLogProps {
  view: GameView
  nameOf: (userId: string | null) => string
}

/** game_events as a readable timeline, oldest first, with actors and payload details. */
export function AuditLog({ view, nameOf }: AuditLogProps) {
  const { t, i18n } = useTranslation(['history', 'common'])
  const events = useGameEvents(view.game.id)

  const ctx: EventContext = {
    seatName: (seat) => view.seats.find((s) => s.seat === seat)?.name ?? null,
    userName: (id) => view.seats.find((s) => s.userId === id)?.name ?? (nameOf(id) || null),
    roundNo: (id) => view.rounds.find((r) => r.id === id)?.displayNo ?? null,
    formatNumber,
    teamLabel: (team: Team) => t(`common:team.${team}`),
    someone: t('events.someone'),
  }

  let body
  if (events.isPending) body = <LoadingBlock />
  else if (events.isError) body = <ErrorBlock error={events.error} onRetry={() => void events.refetch()} />
  else if (events.data.length === 0) {
    body = (
      <Text variant="body" tone={color.inkMuted}>
        {t('detail.auditEmpty')}
      </Text>
    )
  } else {
    body = events.data.map((e, i) => {
      const d = describeEvent(e, ctx)
      return (
        <Row key={e.id} gap={space.md} style={styles.item}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: toneColor[d.tone] }]} />
            {i < events.data.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.flex}>
            <Text variant="body">{t(`events.${d.key}`, { ...d.values })}</Text>
            <Text variant="caption" tone={color.inkFaint}>
              {formatDateTime(e.created_at, i18n.language)}
            </Text>
          </View>
        </Row>
      )
    })
  }

  return (
    <Card>
      <Text variant="label" tone={color.inkMuted}>
        {t('detail.audit')}
      </Text>
      <View>{body}</View>
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingBottom: space.md },
  item: { alignItems: 'stretch' },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 7 },
  line: { flex: 1, width: 2, backgroundColor: color.line, marginTop: space.xxs },
})
