/** Likes and emoji reactions on comments. Pure (tested). Same set as the database check. */

export const REACTIONS = ['👍', '❤️', '😂', '🔥', '👏', '😮'] as const
export type Reaction = (typeof REACTIONS)[number]

/** The like button is the heart. */
export const LIKE: Reaction = '❤️'

export interface ReactionRow {
  readonly comment_id: string
  readonly user_id: string
  readonly emoji: string
}

export interface ReactionCount {
  readonly emoji: Reaction
  readonly count: number
  /** I reacted with it (tapping takes it back). */
  readonly mine: boolean
}

/** One comment's reactions, in the fixed order, only those with at least one. */
export function countReactions(rows: readonly ReactionRow[], commentId: string, me: string): ReactionCount[] {
  const mine = rows.filter((r) => r.comment_id === commentId)
  return REACTIONS.map((emoji) => {
    const of = mine.filter((r) => r.emoji === emoji)
    return { emoji, count: of.length, mine: of.some((r) => r.user_id === me) }
  }).filter((r) => r.count > 0)
}
