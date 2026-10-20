import { useState } from 'react'
import { kv } from '@/lib/kv'
import { type QuickGame, newQuickGame, parseQuickGame } from './model'

const KEY = 'quick-game'

const load = (): QuickGame => {
  try {
    return parseQuickGame(kv.getItemSync(KEY)) ?? newQuickGame()
  } catch {
    return newQuickGame()
  }
}

/** The quick game, saved on every change so an unfinished game resumes after the app is closed. */
export function useQuickGame(): readonly [QuickGame, (next: QuickGame) => void] {
  const [game, setGame] = useState<QuickGame>(load)
  const update = (next: QuickGame): void => {
    setGame(next)
    try {
      kv.setItemSync(KEY, JSON.stringify(next))
    } catch {
      // Storage full or blocked (private browsing): the game still works for this session.
    }
  }
  return [game, update] as const
}
