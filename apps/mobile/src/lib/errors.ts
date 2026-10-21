/**
 * Maps database/RPC failures to stable codes the UI translates (common:errors.<code>).
 * The SQL functions raise human-readable English messages; matching on them keeps the
 * server free of UI concerns. Order matters: first match wins.
 */
export type ErrorCode =
  | 'network'
  | 'notAuthenticated'
  | 'notMember'
  | 'notScorekeeper'
  | 'onlyHost'
  | 'otherTeam'
  | 'gameNotLive'
  | 'gameStarted'
  | 'inviteExpired'
  | 'alreadyResponded'
  | 'roundPending'
  | 'confirmPrevious'
  | 'resultPending'
  | 'negativeNotAllowed'
  | 'outOfRange'
  | 'cutSeats'
  | 'cutTaken'
  | 'invalidCode'
  | 'pinFormat'
  | 'pinAlreadySet'
  | 'reauthRequired'
  | 'nothingToUndo'
  | 'undoPending'
  | 'alreadyConfirmed'
  | 'onlyOrganizer'
  | 'roundInProgress'
  | 'drawInvalid'
  | 'reasonRequired'
  | 'staleAction'
  | 'notSeated'
  | 'tooManyGames'
  | 'tooManyJoinAttempts'
  | 'organizerAdminOnly'
  | 'accountsAdminOnly'
  | 'playerBusy'
  | 'ownerOnly'
  | 'tournamentLocked'
  | 'editWouldTie'
  | 'tournamentClosed'
  | 'unknown'

const RULES: readonly (readonly [RegExp, ErrorCode])[] = [
  [/network request failed|failed to fetch|fetch failed|networkerror|timed? ?out/i, 'network'],
  [/not authenticated|jwt/i, 'notAuthenticated'],
  [/not a member of this club|must belong to the club/i, 'notMember'],
  [/only scorekeepers/i, 'notScorekeeper'],
  [/only the host/i, 'onlyHost'],
  [/other team must/i, 'otherTeam'],
  [/invite has expired/i, 'inviteExpired'],
  [/already responded/i, 'alreadyResponded'],
  [/already waiting for confirmation/i, 'roundPending'],
  [/undo is already waiting/i, 'undoPending'],
  [/confirm the previous round/i, 'confirmPrevious'],
  [/final result is awaiting confirmation/i, 'resultPending'],
  [/game is not live|not waiting for players|game is not active/i, 'gameNotLive'],
  [/round is not waiting for confirmation|round is not pending|there is no result to confirm|no undo is waiting/i, 'staleAction'],
  [/you are not seated in this game|you are not invited/i, 'notSeated'],
  [/already started/i, 'gameStarted'],
  [/negative round scores/i, 'negativeNotAllowed'],
  [/out of range/i, 'outOfRange'],
  [/cut seats/i, 'cutSeats'],
  [/already has the cut bonus/i, 'cutTaken'],
  [/invalid invite code/i, 'invalidCode'],
  [/PIN must be 4 digits/i, 'pinFormat'],
  [/PIN already set/i, 'pinAlreadySet'],
  [/sign in again/i, 'reauthRequired'],
  [/nothing to undo/i, 'nothingToUndo'],
  [/already confirmed|already verified/i, 'alreadyConfirmed'],
  [/only the organizer/i, 'onlyOrganizer'],
  [/still being played/i, 'roundInProgress'],
  [/seated twice|seated or have a bye|stay together|two players per team|unknown entrant|multiple of 4|pair of two/i, 'drawInvalid'],
  [/reason is required/i, 'reasonRequired'],
  [/too many games in progress/i, 'tooManyGames'],
  [/too many invite code attempts/i, 'tooManyJoinAttempts'],
  [/owners and admins can organize/i, 'organizerAdminOnly'],
  [/owners and admins can manage accounts/i, 'accountsAdminOnly'],
  [/already playing another game/i, 'playerBusy'],
  [/only the owner can do this/i, 'ownerOnly'],
  [/tournament games cannot be (deleted|edited)/i, 'tournamentLocked'],
  [/would make the game a tie/i, 'editWouldTie'],
  [/tournament is closed/i, 'tournamentClosed'],
]

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const message = messageOf(error)
  const rule = RULES.find(([pattern]) => pattern.test(message))
  return new AppError(rule ? rule[1] : 'unknown', message)
}

export const isNetworkError = (error: unknown): boolean => toAppError(error).code === 'network'
