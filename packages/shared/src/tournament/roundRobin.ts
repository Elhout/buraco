import type { RoundPlan } from './types'

/**
 * Circle-method round-robin. Every unit meets every other exactly once.
 * With an odd count a phantom slot is added, so each unit sits out exactly one round (bye).
 */
export function roundRobinSchedule(unitIds: readonly string[]): RoundPlan[] {
  if (unitIds.length < 2) return []
  const slots: (string | null)[] = unitIds.length % 2 === 0 ? [...unitIds] : [...unitIds, null]
  const size = slots.length
  const rounds: RoundPlan[] = []

  for (let r = 0; r < size - 1; r += 1) {
    const matches: { teamA: readonly string[]; teamB: readonly string[] }[] = []
    const byes: string[] = []
    for (let i = 0; i < size / 2; i += 1) {
      const a = slots[i] as string | null
      const b = slots[size - 1 - i] as string | null
      // At most one phantom slot exists, so at most one side of a pairing is null.
      if (a === null) byes.push(b as string)
      else if (b === null) byes.push(a)
      else matches.push({ teamA: [a], teamB: [b] })
    }
    rounds.push({ matches, byes })
    // Keep slot 0 fixed, rotate the rest one step.
    slots.splice(1, 0, slots.pop() as string | null)
  }
  return rounds
}
