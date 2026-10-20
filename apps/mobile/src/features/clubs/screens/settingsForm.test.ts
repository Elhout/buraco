import { describe, expect, it } from 'vitest'
import {
  type ClubDraft,
  draftFromClub,
  isDraftDirty,
  parseIsoDate,
  parseWholeNumber,
  todayIso,
  validateClubDraft,
  validateClubName,
} from './settingsForm'

const club = { name: 'Doha Majlis', target_score: 2000, cut_bonus: 100, allow_negative: true, trust_ghost_games: true, season_start: null }
const draft = (over: Partial<ClubDraft> = {}): ClubDraft => ({ ...draftFromClub(club), ...over })

describe('parseWholeNumber', () => {
  const range = { min: 0, max: 5000 }
  it('parses Latin and Arabic digits', () => {
    expect(parseWholeNumber('1500', range)).toBe(1500)
    expect(parseWholeNumber('١٥٠٠', range)).toBe(1500)
    expect(parseWholeNumber(' 1,500 ', range)).toBe(1500)
  })

  it('rejects empty, decimals, negatives and out-of-range values', () => {
    expect(parseWholeNumber('', range)).toBeNull()
    expect(parseWholeNumber('15.5', range)).toBeNull()
    expect(parseWholeNumber('-5', range)).toBeNull()
    expect(parseWholeNumber('9000', range)).toBeNull()
  })
})

describe('parseIsoDate', () => {
  it('accepts real dates only', () => {
    expect(parseIsoDate('2026-09-01')).toBe('2026-09-01')
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('01/09/2026')).toBeNull()
  })

  it('formats today as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('validateClubDraft', () => {
  it('builds the update from a valid draft', () => {
    expect(validateClubDraft(draft({ name: '  New name ', target: '1500', seasonStart: '2026-10-01' }))).toEqual({
      ok: true,
      value: {
        name: 'New name',
        target_score: 1500,
        cut_bonus: 100,
        allow_negative: true,
        trust_ghost_games: true,
        season_start: '2026-10-01',
      },
    })
  })

  it('maps an empty season to null', () => {
    const r = validateClubDraft(draft())
    expect(r.ok && r.value.season_start).toBeNull()
  })

  it('reports every bad field', () => {
    expect(validateClubDraft(draft({ name: ' ', target: '0', cutBonus: 'x', seasonStart: '2026-13-01' }))).toEqual({
      ok: false,
      errors: { name: 'required', target: 'range', cutBonus: 'range', seasonStart: 'date' },
    })
  })

  it('allows a zero cut bonus', () => {
    expect(validateClubDraft(draft({ cutBonus: '0' })).ok).toBe(true)
  })
})

describe('validateClubName / isDraftDirty', () => {
  it('checks the club name length', () => {
    expect(validateClubName('A')).toBeNull()
    expect(validateClubName('')).toBe('required')
    expect(validateClubName('x'.repeat(61))).toBe('tooLong')
  })

  it('detects changes', () => {
    expect(isDraftDirty(draft(), club)).toBe(false)
    expect(isDraftDirty(draft({ allowNegative: false }), club)).toBe(true)
    expect(isDraftDirty(draft({ trustGhost: false }), club)).toBe(true)
  })
})
