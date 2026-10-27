import type { Team } from '@buraco/shared'
import type { RoundView } from '@/features/game/model'

/**
 * The game score after each round (exact-cut bonuses included), keyed by round id. Only counted
 * rounds move the score; undone and unconfirmed rounds have no entry. Pure (tested).
 */
export function runningTotals(rounds: readonly RoundView[]): ReadonlyMap<string, Readonly<Record<Team, number>>> {
  const out = new Map<string, Readonly<Record<Team, number>>>()
  let a = 0
  let b = 0
  for (const r of [...rounds].sort((x, y) => x.roundNo - y.roundNo)) {
    if (r.status !== 'confirmed') continue
    a += r.withBonus.A
    b += r.withBonus.B
    out.set(r.id, { A: a, B: b })
  }
  return out
}
