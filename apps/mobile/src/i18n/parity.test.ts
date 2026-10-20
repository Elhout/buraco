import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every English key must exist in Arabic and vice versa (plural suffixes normalized). */
const LOCALES = join(__dirname, 'locales')
const PLURAL = /_(zero|one|two|few|many|other)$/

type Tree = { [k: string]: string | Tree }

const flatten = (tree: Tree, prefix = ''): Map<string, string> =>
  Object.entries(tree).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') acc.set(key, v)
    else for (const [ik, iv] of flatten(v, key)) acc.set(ik, iv)
    return acc
  }, new Map<string, string>())

const load = (lang: string, ns: string): Map<string, string> => flatten(JSON.parse(readFileSync(join(LOCALES, lang, ns), 'utf8')) as Tree)

const base = (keys: Iterable<string>): Set<string> => new Set([...keys].map((k) => k.replace(PLURAL, '')))
const placeholders = (s: string): string[] => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]!).sort()

describe.each(readdirSync(join(LOCALES, 'en')))('namespace %s', (ns) => {
  const en = load('en', ns)
  const ar = load('ar', ns)

  it('has the same keys in English and Arabic', () => {
    expect([...base(ar.keys())].sort()).toEqual([...base(en.keys())].sort())
  })

  it('gives Arabic the "other" form for every plural', () => {
    for (const key of en.keys()) {
      if (PLURAL.test(key)) expect(ar.has(key.replace(PLURAL, '_other'))).toBe(true)
    }
  })

  it('uses the same {{placeholders}} in both languages', () => {
    for (const [key, value] of en) {
      if (PLURAL.test(key)) continue
      expect(placeholders(ar.get(key) ?? ''), `${ns}:${key}`).toEqual(placeholders(value))
    }
  })

  it('has no empty strings', () => {
    for (const [key, value] of [...en, ...ar]) expect(value.trim(), `${ns}:${key}`).not.toBe('')
  })
})
