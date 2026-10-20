import type { PlayedMatch, Standing } from './types'

export const WIN_POINTS = 2
export const DRAW_POINTS = 1
/** Per-match cap on the point differential (SPEC: "capped at ±1000 per match"). */
export const DIFFERENTIAL_CAP = 1000

export interface StandingsInput {
  readonly units: readonly string[]
  readonly matches: readonly PlayedMatch[]
  /**
   * One entry per bye awarded (a unit id may repeat). Design choice: a bye is scored as a win
   * (2 match points, counted as played) with 0 point differential and 0 points for/against,
   * so a bye never helps or hurts the tiebreakers beyond the win itself.
   */
  readonly byes?: readonly string[]
}

interface Tally {
  played: number
  wins: number
  draws: number
  losses: number
  matchPoints: number
  differential: number
  pointsFor: number
  pointsAgainst: number
}

type Outcome = 'win' | 'draw' | 'loss'

const emptyTally = (): Tally => ({
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  matchPoints: 0,
  differential: 0,
  pointsFor: 0,
  pointsAgainst: 0,
})

const clamp = (n: number, limit: number): number => Math.max(-limit, Math.min(limit, n))

const pointsFor = (outcome: Outcome): number => (outcome === 'win' ? WIN_POINTS : outcome === 'draw' ? DRAW_POINTS : 0)

function apply(tally: Tally, outcome: Outcome, scored: number, conceded: number): void {
  tally.played += 1
  tally.matchPoints += pointsFor(outcome)
  if (outcome === 'win') tally.wins += 1
  else if (outcome === 'draw') tally.draws += 1
  else tally.losses += 1
  tally.pointsFor += scored
  tally.pointsAgainst += conceded
  tally.differential += clamp(scored - conceded, DIFFERENTIAL_CAP)
}

function outcomeFor(result: 'a' | 'b' | 'draw', side: 'a' | 'b'): Outcome {
  if (result === 'draw') return 'draw'
  return result === side ? 'win' : 'loss'
}

/** Match points each unit of `group` earned against other members of `group` (opposite sides only). */
function headToHead(group: ReadonlySet<string>, matches: readonly PlayedMatch[]): Map<string, number> {
  const earned = new Map<string, number>([...group].map((u) => [u, 0]))
  for (const m of matches) {
    if (m.result === null) continue
    const sides = [
      { team: m.teamA, rival: m.teamB, side: 'a' as const },
      { team: m.teamB, rival: m.teamA, side: 'b' as const },
    ]
    for (const { team, rival, side } of sides) {
      if (!rival.some((u) => group.has(u))) continue
      for (const u of team) {
        if (group.has(u)) earned.set(u, (earned.get(u) as number) + pointsFor(outcomeFor(m.result, side)))
      }
    }
  }
  return earned
}

/**
 * Ranks units. Tiebreak order (SPEC "Scoring and ranking"): match points, then capped point
 * differential, then head-to-head (match points earned only against the other tied units), then total
 * points scored, then unit id so the order is fully deterministic. Head-to-head is evaluated once per
 * tied group and is not re-applied recursively to sub-groups. Ranks are always distinct.
 */
export function computeStandings(input: StandingsInput): Standing[] {
  const tallies = new Map<string, Tally>(input.units.map((u) => [u, emptyTally()]))

  for (const m of input.matches) {
    if (m.result === null) continue
    const sides = [
      { team: m.teamA, side: 'a' as const, scored: m.pointsA, conceded: m.pointsB },
      { team: m.teamB, side: 'b' as const, scored: m.pointsB, conceded: m.pointsA },
    ]
    for (const { team, side, scored, conceded } of sides) {
      for (const u of team) {
        const tally = tallies.get(u)
        if (tally !== undefined) apply(tally, outcomeFor(m.result, side), scored, conceded)
      }
    }
  }
  for (const u of input.byes ?? []) {
    const tally = tallies.get(u)
    if (tally !== undefined) apply(tally, 'win', 0, 0)
  }

  const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
  const get = (u: string): Tally => tallies.get(u) as Tally
  const primary = [...tallies.keys()].sort(
    (a, b) => get(b).matchPoints - get(a).matchPoints || get(b).differential - get(a).differential || byId(a, b),
  )

  const ordered: string[] = []
  let start = 0
  while (start < primary.length) {
    const first = get(primary[start] as string)
    let end = start + 1
    while (
      end < primary.length &&
      get(primary[end] as string).matchPoints === first.matchPoints &&
      get(primary[end] as string).differential === first.differential
    ) {
      end += 1
    }
    const group = primary.slice(start, end)
    const h2h = headToHead(new Set(group), input.matches)
    group.sort((a, b) => (h2h.get(b) as number) - (h2h.get(a) as number) || get(b).pointsFor - get(a).pointsFor || byId(a, b))
    ordered.push(...group)
    start = end
  }

  return ordered.map((unit, i) => ({ unit, rank: i + 1, ...get(unit) }))
}
