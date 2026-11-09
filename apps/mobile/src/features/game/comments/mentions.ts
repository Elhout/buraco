/**
 * @mentions in game comments. Pure (tested). The app keeps the members picked from the
 * suggestions; a mention counts while "@Name" is still in the text.
 */

export interface Picked {
  readonly userId: string
  readonly name: string
}

/** The name being typed after an "@" at the end of the text (at the start or after a space), else null. */
export function mentionQuery(text: string): string | null {
  const at = text.lastIndexOf('@')
  if (at < 0 || (at > 0 && !/\s/.test(text[at - 1]!))) return null
  const query = text.slice(at + 1)
  return query.includes('\n') || query.length > 24 ? null : query
}

/** Replaces the "@query" at the end with "@Name " (the space ends the mention). */
export function insertMention(text: string, name: string): string {
  const at = text.lastIndexOf('@')
  return `${at < 0 ? text : text.slice(0, at)}@${name} `
}

/** The picked members still mentioned in the text, each once. */
export function mentionedIds(text: string, picked: readonly Picked[]): string[] {
  return [...new Set(picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.userId))]
}

export interface Segment {
  readonly text: string
  readonly mention: boolean
}

/** Splits a comment into plain text and "@Name" mentions of the given names (longest names first). */
export function splitMentions(body: string, names: readonly string[]): Segment[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)
  const out: Segment[] = []
  let rest = body
  while (rest.length > 0) {
    let best: { index: number; name: string } | null = null
    for (const name of sorted) {
      const index = rest.indexOf(`@${name}`)
      if (index >= 0 && (best === null || index < best.index)) best = { index, name }
    }
    if (!best) {
      out.push({ text: rest, mention: false })
      break
    }
    if (best.index > 0) out.push({ text: rest.slice(0, best.index), mention: false })
    out.push({ text: `@${best.name}`, mention: true })
    rest = rest.slice(best.index + best.name.length + 1)
  }
  return out
}
