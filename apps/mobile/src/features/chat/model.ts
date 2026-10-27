import type { Tables } from '@buraco/shared'

/** Chat list presentation. Pure (tested in model.test.ts). */

export type ChatRow = Tables<'chat_messages'>

/** Messages from the same person this close together read as one run (name shown once). */
export const RUN_GAP_MS = 5 * 60_000

export interface Bubble {
  readonly id: string
  readonly userId: string
  readonly body: string
  readonly createdAt: string
  readonly mine: boolean
  /** First message of a run: show the sender's name (others' messages) and the time above it. */
  readonly startsRun: boolean
}

/** Rows newest first (as loaded, for an inverted list): a run starts where the older neighbour differs. */
export function toBubbles(rows: readonly ChatRow[], me: string): Bubble[] {
  return rows.map((r, i) => {
    const older = rows[i + 1]
    const startsRun =
      !older || older.user_id !== r.user_id || new Date(r.created_at).getTime() - new Date(older.created_at).getTime() > RUN_GAP_MS
    return { id: r.id, userId: r.user_id, body: r.body, createdAt: r.created_at, mine: r.user_id === me, startsRun }
  })
}
