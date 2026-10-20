import type { Team } from '@buraco/shared'

/**
 * Why the scoring actions (Enter round, +100 exact cut) are disabled, mirroring the checks in
 * submit_round / add_cut so the scorekeeper sees the reason instead of an error after tapping.
 */
export type BlockReason = 'notLive' | 'resultPending' | 'confirmFirst' | 'waitingOther' | 'sending'

export interface ActionInput {
  readonly live: boolean
  readonly resultProposed: boolean
  readonly hasPendingRound: boolean
  readonly awaitingMyConfirmation: boolean
  /** Rounds of this game still in the outbox. */
  readonly sendingCount: number
}

export function actionBlock(input: ActionInput): BlockReason | null {
  if (!input.live) return 'notLive'
  if (input.resultProposed) return 'resultPending'
  if (input.awaitingMyConfirmation) return 'confirmFirst'
  if (input.hasPendingRound) return 'waitingOther'
  // A second round or a cut while ours is still queued would land on the wrong deal.
  if (input.sendingCount > 0) return 'sending'
  return null
}

export const opponentOf = (team: Team): Team => (team === 'A' ? 'B' : 'A')
