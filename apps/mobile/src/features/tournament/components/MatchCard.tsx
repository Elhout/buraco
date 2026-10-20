import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Card, Chevron, Row, Score, TeamBadge, Text } from '@/components/ui'
import { color, type Team, teamColor } from '@/theme/tokens'
import { needsResult } from '../model'
import type { MatchView } from '../types'
import { PAIR_JOINER, type UnitIndex } from '../units'

export interface MatchCardProps {
  match: MatchView
  index: UnitIndex
  mine: boolean
  onOpen: (() => void) | null
  /** Organizer only, while the tournament is open. */
  onEdit: (() => void) | null
}

function TeamLine({ team, names, score, won }: { team: Team; names: string; score: number; won: boolean }) {
  return (
    <Row gap={12}>
      <TeamBadge team={team} size="sm" />
      <Text variant={won ? 'bodyStrong' : 'body'} style={styles.flex} numberOfLines={2}>
        {names}
      </Text>
      <Score value={score} size="scoreSm" tone={won ? teamColor(team) : color.ink} />
    </Row>
  )
}

function useStatusText(match: MatchView): { text: string; tone: string } {
  const { t } = useTranslation('tournament')
  if (match.result !== null) return { text: t(`detail.result.${match.result}`), tone: color.ink }
  if (needsResult(match)) return { text: t('detail.noResult'), tone: color.warning }
  if (match.gameStatus === null) return { text: '', tone: color.inkMuted }
  return { text: t(`detail.gameStatus.${match.gameStatus}`), tone: match.gameStatus === 'live' ? color.success : color.inkMuted }
}

/** One table: both teams with live score (or final points), game status, and the organizer's edit. */
export function MatchCard({ match, index, mine, onOpen, onEdit }: MatchCardProps) {
  const { t } = useTranslation('tournament')
  const status = useStatusText(match)
  const decided = match.result !== null
  const scoreA = decided ? (match.pointsA ?? 0) : match.liveA
  const scoreB = decided ? (match.pointsB ?? 0) : match.liveB
  const namesA = match.teamA.map(index.entryName).join(PAIR_JOINER)
  const namesB = match.teamB.map(index.entryName).join(PAIR_JOINER)
  return (
    <Card
      onPress={onOpen ?? undefined}
      tone={mine ? 'raised' : 'surface'}
      accent={mine ? color.primary : undefined}
      accessibilityLabel={t('detail.a11yMatch', { table: match.tableNo, a: namesA, scoreA, b: namesB, scoreB, status: status.text })}>
      <Row gap={8}>
        <Text variant="label" tone={color.inkMuted} style={styles.flex}>
          {t('detail.table', { n: match.tableNo })}
        </Text>
        <Text variant="caption" tone={status.tone}>
          {status.text}
        </Text>
        {onOpen ? <Chevron /> : null}
      </Row>
      <TeamLine team="A" names={namesA} score={scoreA} won={match.result === 'a'} />
      <TeamLine team="B" names={namesB} score={scoreB} won={match.result === 'b'} />
      {match.editedReason ? (
        <Text variant="caption" tone={color.inkMuted}>
          {t('detail.edited', { reason: match.editedReason })}
        </Text>
      ) : null}
      {onEdit ? (
        <View style={styles.edit}>
          <Button
            variant={needsResult(match) ? 'secondary' : 'quiet'}
            label={decided ? t('organizer.editResult') : t('organizer.enterResult')}
            onPress={onEdit}
          />
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  edit: { alignItems: 'flex-end' },
})
