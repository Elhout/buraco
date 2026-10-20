import type { Team, Totals } from '@buraco/shared'
import type { GameView } from '../model'

/**
 * What the game-over screen shows: the decided (finished) or proposed result, per-team
 * confirmation, and what the viewer may still do. Pure; the database decides the result.
 */

export type ResultKind = 'won' | 'draw' | 'abandoned' | 'inProgress'

export interface ResultSummary {
  readonly kind: ResultKind
  readonly winner: Team | null
  readonly totals: Totals
  readonly roundsPlayed: number
  /** Finished: the result is final. Otherwise it is proposed and waiting for confirmations. */
  readonly final: boolean
  readonly confirmed: { readonly A: boolean; readonly B: boolean }
}

type ResultInput = Pick<GameView, 'game' | 'totals' | 'rounds' | 'resultProposed'>

function kindOf(input: ResultInput): { kind: ResultKind; winner: Team | null } {
  const { game } = input
  if (game.status === 'abandoned') return { kind: 'abandoned', winner: null }
  if (game.status === 'finished') {
    return game.winner_team ? { kind: 'won', winner: game.winner_team } : { kind: 'draw', winner: null }
  }
  if (input.resultProposed) {
    return game.proposed_winner ? { kind: 'won', winner: game.proposed_winner } : { kind: 'draw', winner: null }
  }
  return { kind: 'inProgress', winner: null }
}

export function resultSummary(input: ResultInput): ResultSummary {
  const { kind, winner } = kindOf(input)
  const final = input.game.status === 'finished'
  const teams = input.game.result_confirmed_teams ?? []
  return {
    kind,
    winner,
    totals: input.totals,
    roundsPlayed: input.rounds.filter((r) => r.status === 'confirmed').length,
    final,
    confirmed: { A: final || teams.includes('A'), B: final || teams.includes('B') },
  }
}

export interface ShareParams {
  readonly key: 'won' | 'draw'
  readonly winnerTeam: Team | null
  readonly winners: string
  readonly losers: string
  readonly high: number
  readonly low: number
  readonly count: number
}

/** Parameters for the localized share text, or null when there is nothing final to share. */
export function shareParams(summary: ResultSummary, names: { readonly A: string; readonly B: string }): ShareParams | null {
  if (!summary.final || (summary.kind !== 'won' && summary.kind !== 'draw')) return null
  const winnerTeam = summary.winner
  const first: Team = winnerTeam ?? 'A'
  const second: Team = first === 'A' ? 'B' : 'A'
  return {
    key: summary.kind,
    winnerTeam,
    winners: names[first],
    losers: names[second],
    high: Math.max(summary.totals.A, summary.totals.B),
    low: Math.min(summary.totals.A, summary.totals.B),
    count: summary.roundsPlayed,
  }
}
