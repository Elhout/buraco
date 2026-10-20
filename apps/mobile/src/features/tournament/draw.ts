import {
  type DecidedMatch,
  type RoundPlan,
  computeStandings,
  createRng,
  isKnockoutComplete,
  knockoutBracket,
  nextKnockoutRound,
  rotatingTables,
  roundRobinSchedule,
  swissPairing,
} from '@buraco/shared'
import type { MatchView, RoundRow, TournamentFormat, TournamentPairing } from './types'
import { type UnitIndex, allByes, toPlayedMatches } from './units'

/**
 * Builds the next round's draw from database rows with the pure engine in @buraco/shared.
 * The organizer's phone runs this; start_round validates the result server-side.
 */
export type NextDraw =
  | { readonly kind: 'ready'; readonly roundNo: number; readonly plan: RoundPlan; readonly random: boolean }
  /** A round is still being played. */
  | { readonly kind: 'waiting' }
  /** Schedule exhausted (round-robin) or bracket decided (knockout); champion for knockout. */
  | { readonly kind: 'complete'; readonly champion: string | null }
  /** The entrants cannot form a round in this format. */
  | { readonly kind: 'invalid' }

export interface DrawInput {
  readonly format: TournamentFormat
  readonly pairing: TournamentPairing
  readonly index: UnitIndex
  readonly matches: readonly MatchView[]
  readonly rounds: readonly RoundRow[]
  readonly seed: number
}

const nextRoundNo = (rounds: readonly RoundRow[]): number => rounds.reduce((n, r) => Math.max(n, r.round_no), 0) + 1

function rotatingDraw(input: DrawInput, roundNo: number): NextDraw {
  const { index } = input
  if (input.format === 'knockout') return { kind: 'invalid' }
  // Round-robin of individuals: everyone can partner everyone else once.
  if (input.format === 'round_robin' && roundNo > index.units.length - 1) return { kind: 'complete', champion: null }
  if (index.units.length === 0 || index.units.length % 4 !== 0) return { kind: 'invalid' }
  const plan = rotatingTables({ players: index.units, history: toPlayedMatches(input.matches, index), rng: createRng(input.seed) })
  return { kind: 'ready', roundNo, plan, random: true }
}

function roundRobinDraw(input: DrawInput, roundNo: number): NextDraw {
  const schedule = roundRobinSchedule(input.index.units)
  if (schedule.length === 0) return { kind: 'invalid' }
  const plan = schedule[input.rounds.length]
  if (plan === undefined) return { kind: 'complete', champion: null }
  return { kind: 'ready', roundNo, plan, random: false }
}

function swissDraw(input: DrawInput, roundNo: number): NextDraw {
  const { units } = input.index
  if (units.length < 2) return { kind: 'invalid' }
  const history = toPlayedMatches(input.matches, input.index)
  const byes = allByes(input.rounds)
  const standings = computeStandings({ units, matches: history, byes })
  const plan = swissPairing({ units, standings, history, byeHistory: byes, rng: createRng(input.seed) })
  return { kind: 'ready', roundNo, plan, random: history.length === 0 }
}

/** Previous knockout round's matches as decided matches, in bracket (table) order; null if any is undecided. */
function decidedMatches(input: DrawInput, round: RoundRow): DecidedMatch[] | null {
  const rows = input.matches.filter((m) => m.roundId === round.id).sort((a, b) => a.tableNo - b.tableNo)
  const played = toPlayedMatches(rows, input.index)
  if (played.some((m) => m.result !== 'a' && m.result !== 'b')) return null
  return played.map((m) => ({ match: { teamA: m.teamA, teamB: m.teamB }, winner: m.result === 'a' ? 'A' : 'B' }))
}

function knockoutDraw(input: DrawInput, roundNo: number): NextDraw {
  if (input.rounds.length === 0) {
    const plan = knockoutBracket(input.index.units)
    return plan.matches.length === 0 ? { kind: 'invalid' } : { kind: 'ready', roundNo, plan, random: false }
  }
  const previous = [...input.rounds].sort((a, b) => b.round_no - a.round_no)[0] as RoundRow
  const decided = decidedMatches(input, previous)
  if (decided === null) return { kind: 'invalid' }
  try {
    const plan = nextKnockoutRound(decided, previous.byes)
    if (isKnockoutComplete(plan)) return { kind: 'complete', champion: plan.byes[0] ?? null }
    return { kind: 'ready', roundNo, plan, random: false }
  } catch {
    return { kind: 'invalid' }
  }
}

export function nextDraw(input: DrawInput): NextDraw {
  if (input.rounds.some((r) => r.status === 'live')) return { kind: 'waiting' }
  const roundNo = nextRoundNo(input.rounds)
  if (input.pairing === 'rotating') return rotatingDraw(input, roundNo)
  if (input.format === 'round_robin') return roundRobinDraw(input, roundNo)
  if (input.format === 'swiss') return swissDraw(input, roundNo)
  return knockoutDraw(input, roundNo)
}

// Plain object types (not interfaces) so they are assignable to the RPC's Json parameter.
export type DrawTable = { table_no: number; team_a: string[]; team_b: string[] }
export type StartRoundArgs = { p_tournament_id: string; p_matches: DrawTable[]; p_byes: string[] }

/** Engine plan (units) → start_round payload (entry ids). Table numbers follow plan order. */
export function toStartRoundArgs(tournamentId: string, plan: RoundPlan, index: UnitIndex): StartRoundArgs {
  return {
    p_tournament_id: tournamentId,
    p_matches: plan.matches.map((m, i) => ({
      table_no: i + 1,
      team_a: m.teamA.flatMap((u) => index.entriesOf(u)),
      team_b: m.teamB.flatMap((u) => index.entriesOf(u)),
    })),
    p_byes: [...plan.byes],
  }
}

/** A fresh seed for "reshuffle". Kept here so screens stay free of randomness details. */
export const newSeed = (): number => Math.floor(Math.random() * 2 ** 31)
