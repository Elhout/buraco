import { Ionicons } from '@expo/vector-icons'
import type { Team } from '@buraco/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, Chevron, Row, Score, TeamBadge, Text } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { usePresence } from '@/lib/realtime'
import { color, radius, space, teamColor } from '@/theme/tokens'
import { Chip } from './Chip'
import { type LobbyGame, type LobbySeat, gameHref, teamOf } from './model'

export interface GameCardProps {
  game: LobbyGame
  /** Watch the game's spectator channel; off while the lobby is hidden so it never collides with the game screen's. */
  watch: boolean
}

const statusIcon: Record<LobbySeat['inviteStatus'], { name: keyof typeof Ionicons.glyphMap; tone: string }> = {
  invited: { name: 'hourglass-outline', tone: color.warning },
  confirmed: { name: 'checkmark-circle', tone: color.success },
  declined: { name: 'close-circle', tone: color.danger },
}

/** Spectators on `game:<id>` Presence: everyone there who isn't seated. Watch-only (never tracks). */
function useSpectators(game: LobbyGame, enabled: boolean): number {
  const present = usePresence<Record<string, never>>(`game:${game.id}`, null, null, enabled)
  const seated = new Set(game.seats.flatMap((s) => (s.userId ? [s.userId] : [])))
  return present.filter((p) => !seated.has(p.key)).length
}

function TeamLine({ team, game }: { team: Team; game: LobbyGame }) {
  const { t } = useTranslation(['lobby', 'common'])
  const seats = teamOf(game, team)
  const live = game.status === 'live'
  return (
    <Row gap={space.md}>
      <TeamBadge team={team} size="sm" />
      <View style={styles.pair}>
        {seats.map((s, i) => (
          <View key={s.seat} style={i > 0 ? styles.overlap : null}>
            <Avatar name={s.name} url={s.avatarUrl} size={32} ring={teamColor(team)} />
          </View>
        ))}
      </View>
      <View style={styles.names}>
        {seats.map((s) => (
          <Row key={s.seat} gap={space.xs}>
            {live ? null : <Ionicons name={statusIcon[s.inviteStatus].name} size={14} color={statusIcon[s.inviteStatus].tone} />}
            <Text variant="label" numberOfLines={1} tone={s.isMe ? color.ink : color.inkMuted} style={styles.flex}>
              {s.isMe ? t('common:you') : s.name}
            </Text>
          </Row>
        ))}
      </View>
      {live ? <Score value={game.totals[team]} size="scoreSm" tone={teamColor(team)} /> : null}
    </Row>
  )
}

function CardTop({ game, spectators }: { game: LobbyGame; spectators: number }) {
  const { t } = useTranslation(['lobby', 'common'])
  const confirmed = game.seats.filter((s) => s.inviteStatus === 'confirmed').length
  return (
    <Row gap={space.sm}>
      {game.status === 'live' ? (
        <Chip tone="live" dot label={t('common:status.live')} />
      ) : (
        <Chip tone="inviting" label={t('playing.waiting')} />
      )}
      <View style={styles.flex} />
      <Text variant="caption" tone={color.inkMuted}>
        {game.status === 'live'
          ? t('playing.round', { n: formatNumber(game.roundsPlayed + 1) })
          : t('playing.confirmed', { count: confirmed })}
      </Text>
    </Row>
  )
}

/** One table in "Playing now": both teams in their colours, the score, round and who's watching. */
export function GameCard({ game, watch }: GameCardProps) {
  const { t } = useTranslation(['lobby', 'common'])
  const spectators = useSpectators(game, watch && game.status === 'live')
  const names = (team: Team): string =>
    teamOf(game, team)
      .map((s) => s.name)
      .join(` ${t('common:and')} `)
  const accent = game.status === 'live' ? color.success : color.lineStrong
  const label = t('playing.cardLabel', {
    teamA: names('A'),
    teamB: names('B'),
    scoreA: formatNumber(game.totals.A),
    scoreB: formatNumber(game.totals.B),
    status: t(`common:status.${game.status}`),
  })

  return (
    <Card onPress={() => router.push(gameHref(game))} accent={accent} accessibilityLabel={label}>
      <CardTop game={game} spectators={spectators} />
      <TeamLine team="A" game={game} />
      <View style={styles.rule} />
      <TeamLine team="B" game={game} />
      {game.imSeated ? (
        <View style={styles.strip}>
          <Ionicons name="person-outline" size={18} color={color.ink} />
          <Text variant="label" tone={color.ink} style={styles.flex}>
            {t('playing.yourGame')}
          </Text>
          <Chevron tone={color.inkMuted} />
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row' },
  overlap: { marginStart: -10 },
  names: { flex: 1, gap: space.xxs },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginStart: 34 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.raised,
  },
  stripInvite: { borderWidth: 1, borderColor: color.warning },
})
