import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Score, TeamBadge, Text } from '@/components/ui'
import { color, radius, space, teamColor, teamSoft } from '@/theme/tokens'
import { type GameView, teamNames } from '../model'
import type { ResultSummary } from './resultModel'

interface WinnerHeroProps {
  readonly view: GameView
  readonly summary: ResultSummary
}

/** The winner, huge and in team colour, or the clock draw; then the final totals A (start) vs B (end). */
export function WinnerHero({ view, summary }: WinnerHeroProps) {
  const { t } = useTranslation(['game', 'common'])
  const winner = summary.winner
  const tone = winner ? teamColor(winner) : color.ink
  return (
    <View style={[styles.hero, { backgroundColor: winner ? teamSoft(winner) : color.surface, borderColor: tone }]}>
      {winner ? <TeamBadge team={winner} /> : null}
      <Text variant="display" tone={tone} center accessibilityRole="header" style={styles.headline}>
        {winner ? t('result.wins', { team: winner }) : t('result.draw')}
      </Text>
      {winner ? (
        <Text variant="bodyStrong" center>
          {teamNames(view, winner)}
        </Text>
      ) : (
        <Text variant="body" tone={color.inkMuted} center>
          {t('result.drawNote')}
        </Text>
      )}
      <View style={styles.totals}>
        {(['A', 'B'] as const).map((team) => (
          <View key={team} style={styles.side}>
            <Text variant="caption" tone={color.inkMuted}>
              {t(`common:team.${team}`)}
            </Text>
            <Score
              value={summary.totals[team]}
              size="scoreXl"
              tone={teamColor(team)}
              style={winner && winner !== team ? styles.loser : undefined}
            />
          </View>
        ))}
      </View>
      <Text variant="label" tone={color.inkMuted} center>
        {t('result.rounds', { count: summary.roundsPlayed })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.xl, gap: space.sm, alignItems: 'center' },
  headline: { fontSize: 40, lineHeight: 48 },
  totals: { flexDirection: 'row', alignSelf: 'stretch', marginTop: space.md },
  side: { flex: 1, alignItems: 'center' },
  loser: { opacity: 0.55 },
})
