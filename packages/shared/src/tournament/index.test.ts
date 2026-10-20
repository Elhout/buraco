import { describe, expect, it } from 'vitest'
import * as tournament from './index'

describe('tournament barrel', () => {
  it('exports the public engine API', () => {
    for (const name of [
      'createRng',
      'shuffle',
      'roundRobinSchedule',
      'swissPairing',
      'rotatingTables',
      'InvalidPlayerCountError',
      'knockoutBracket',
      'nextKnockoutRound',
      'isKnockoutComplete',
      'KnockoutError',
      'computeStandings',
      'standingsToCsv',
      'matchesToCsv',
    ]) {
      expect(tournament).toHaveProperty(name)
    }
  })
})
