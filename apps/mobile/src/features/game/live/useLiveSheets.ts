import { useEffect, useRef, useState } from 'react'
import type { GameView } from '../model'
import type { MenuTarget } from './GameMenuSheet'

export type SheetKind = 'enter' | 'cut' | 'menu' | 'confirm' | 'target' | 'endNow' | MenuTarget

/** iOS can't present a Modal while another is still sliding out, so swaps wait this long. */
const SWAP_MS = 380

export interface LiveSheets {
  readonly sheet: SheetKind | null
  readonly open: (kind: SheetKind) => void
  /** Close the current sheet, then open `next` once it is gone. */
  readonly swap: (next: SheetKind) => void
  readonly close: () => void
}

/**
 * One sheet at a time. The confirm sheet opens by itself on the phone that must confirm a
 * pending round (spec: "Confirm sheet pops on the scorekeeper's phone only"), once per round.
 * The target sheet ("end game or keep playing?") opens by itself once per proposed result, on
 * phones that may decide (`targetKey` = that proposal, else null).
 */
export function useLiveSheets(view: GameView | null, targetKey: string | null = null): LiveSheets {
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [dismissedTarget, setDismissedTarget] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awaitingId = view?.awaitingMyConfirmation?.id ?? null

  const later = (next: SheetKind): void => {
    if (timer.current) clearTimeout(timer.current)
    // Never replace a sheet the user opened in the meantime.
    timer.current = setTimeout(() => setSheet((current) => current ?? next), SWAP_MS)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (awaitingId === null || sheet !== null || dismissed === awaitingId) return
    later('confirm')
  }, [awaitingId, sheet, dismissed])

  useEffect(() => {
    if (targetKey === null || sheet !== null || dismissedTarget === targetKey) return
    later('target')
  }, [targetKey, sheet, dismissedTarget])

  // The round (or the result) was settled elsewhere: its sheet no longer applies.
  const shownSheet = (sheet === 'confirm' && awaitingId === null) || (sheet === 'target' && targetKey === null) ? null : sheet

  const close = (): void => {
    if (sheet === 'confirm') setDismissed(awaitingId)
    if (sheet === 'target') setDismissedTarget(targetKey)
    setSheet(null)
  }

  return {
    sheet: shownSheet,
    open: (kind) => {
      if (kind === 'confirm') setDismissed(null)
      setSheet(kind)
    },
    swap: (next) => {
      setSheet(null)
      later(next)
    },
    close,
  }
}
