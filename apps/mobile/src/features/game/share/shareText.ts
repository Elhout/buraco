import type { Team } from '@buraco/shared'
import { runningTotals } from '../../history/detail/runningTotals'
import { type GameView, teamNames } from '../model'

/** The web app; a shared link opens the game there (sign-in needed, like everywhere in the club). */
export const WEB_APP_URL = 'https://buraco-club.pages.dev'

type T = (key: string, values?: Record<string, string | number>) => string

/**
 * A game as a WhatsApp message: status line, both teams with their score, the winner, then every
 * counted round with the running total, and a link. Pure (tested); `t` is the `game` namespace.
 */
export function gameShareText(view: GameView, t: T, n: (value: number) => string): string {
  const { game } = view
  const finished = game.status === 'finished'
  const winner: Team | null = finished ? (game.winner_team as Team | null) : null
  const counted = [...view.rounds].filter((r) => r.status === 'confirmed').sort((a, b) => a.roundNo - b.roundNo)
  const totals = runningTotals(view.rounds)

  const head = finished ? t('share.final') : game.status === 'abandoned' ? t('share.abandoned') : t('share.live')
  const team = (side: Team): string =>
    t('share.team', { team: side, names: teamNames(view, side), score: n(view.totals[side]) }) + (winner === side ? ' 🏆' : '')
  const result = winner
    ? t('share.winner', { team: winner })
    : finished
      ? t('share.draw')
      : t('share.target', { points: n(view.config.targetScore), rounds: counted.length, count: counted.length })
  const rounds = counted.map((r, i) => {
    const after = totals.get(r.id)
    return t('share.round', {
      n: i + 1,
      a: n(r.withBonus.A),
      b: n(r.withBonus.B),
      totalA: n(after?.A ?? 0),
      totalB: n(after?.B ?? 0),
    })
  })
  const link = `${WEB_APP_URL}${finished || game.status === 'abandoned' ? `/history/${game.id}` : `/game/${game.id}`}`

  return [head, '', team('A'), team('B'), result, ...(rounds.length > 0 ? ['', t('share.rounds'), ...rounds] : []), '', link].join('\n')
}

/** Opens WhatsApp with the text ready to send (the phone's app, or WhatsApp Web). */
export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`
