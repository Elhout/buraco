import { describe, expect, it } from 'vitest'
import { AppError, isNetworkError, toAppError } from './errors'

describe('toAppError', () => {
  it.each([
    ['invite has expired', 'inviteExpired'],
    ['a round is already waiting for confirmation', 'roundPending'],
    ['an undo is already waiting for approval', 'undoPending'],
    ['only scorekeepers can do this', 'notScorekeeper'],
    ['the other team must confirm this round', 'otherTeam'],
    ['the final result is awaiting confirmation', 'resultPending'],
    ['game is not live', 'gameNotLive'],
    ['negative round scores are not allowed in this club', 'negativeNotAllowed'],
    ['invalid invite code', 'invalidCode'],
    ['sign in again to reset your PIN', 'reauthRequired'],
    ['fixed pairs must stay together', 'drawInvalid'],
    ['round is not waiting for confirmation', 'staleAction'],
    ['there is no result to confirm', 'staleAction'],
    ['you are not seated in this game', 'notSeated'],
    ['too many games in progress', 'tooManyGames'],
    ['too many invite code attempts, try again later', 'tooManyJoinAttempts'],
    ['the tournament is closed', 'tournamentClosed'],
    ['only club owners and admins can manage accounts', 'accountsAdminOnly'],
    ['TypeError: Network request failed', 'network'],
    ['something entirely new', 'unknown'],
  ])('maps %j to %s', (message, code) => {
    expect(toAppError({ message, code: 'P0001' }).code).toBe(code)
  })

  it('keeps the original message and passes AppErrors through', () => {
    const e = toAppError(new Error('only the host can do this'))
    expect(e).toBeInstanceOf(AppError)
    expect(e.message).toBe('only the host can do this')
    expect(toAppError(e)).toBe(e)
  })

  it('handles non-error values', () => {
    expect(toAppError('boom').code).toBe('unknown')
    expect(toAppError(null).code).toBe('unknown')
  })

  it('detects network errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('game is not live'))).toBe(false)
  })
})
