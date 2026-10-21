import type { Team } from '@buraco/shared'
import type { GameView } from '../model'
import { AbandonSheet } from './AbandonSheet'
import { ConfirmRoundSheet } from './ConfirmRoundSheet'
import { CutSheet } from './CutSheet'
import { EnterRoundSheet } from './EnterRoundSheet'
import { GameMenuSheet } from './GameMenuSheet'
import { ReassignSheet } from './ReassignSheet'
import { UndoApproveSheet, UndoRequestSheet } from './UndoSheets'
import { WatchersSheet } from './WatchersSheet'
import type { Watcher } from './useLiveEffects'
import type { LiveSheets as Sheets } from './useLiveSheets'

interface LiveSheetsProps {
  readonly view: GameView
  readonly sheets: Sheets
  readonly watchers: readonly Watcher[]
  /** Team selected when round entry was opened by tapping a score. */
  readonly entryFocus?: Team
}

/** Every sheet of the live screen; `sheets.sheet` says which one is up. */
export function LiveSheets({ view, sheets, watchers, entryFocus }: LiveSheetsProps) {
  const { sheet, close, swap } = sheets
  const scoring = view.canScore
  const confirmRound = view.awaitingMyConfirmation
  return (
    <>
      {scoring ? (
        <>
          <EnterRoundSheet visible={sheet === 'enter'} view={view} onClose={close} onSent={close} focus={entryFocus} />
          <CutSheet visible={sheet === 'cut'} view={view} onClose={close} />
          <GameMenuSheet visible={sheet === 'menu'} view={view} onClose={close} onSelect={swap} />
          <UndoRequestSheet visible={sheet === 'undo'} view={view} onClose={close} />
          <ReassignSheet visible={sheet === 'reassign'} view={view} onClose={close} />
          <AbandonSheet visible={sheet === 'abandon'} view={view} onClose={close} />
        </>
      ) : null}
      {confirmRound ? <ConfirmRoundSheet visible={sheet === 'confirm'} view={view} round={confirmRound} onClose={close} /> : null}
      {view.awaitingMyUndo ? <UndoApproveSheet visible={sheet === 'undoApprove'} view={view} onClose={close} /> : null}
      <WatchersSheet visible={sheet === 'watchers'} watchers={watchers} onClose={close} />
    </>
  )
}
