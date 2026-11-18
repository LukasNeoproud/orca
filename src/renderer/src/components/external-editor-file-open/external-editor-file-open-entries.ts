import {
  getOpenInEntryAvailability,
  getWorktreeOpenInEntries,
  type OpenInMenuEntry
} from '@/components/sidebar/WorktreeOpenInMenu'
import type { OpenInApplication } from '../../../../shared/ui-chrome-types'
import type { ExternalEditorFileTarget } from './external-editor-file-target'

export type ExternalEditorFileOpenEntry = {
  id: string
  label: string
  command: string
  disabled: boolean
  /** Why the application cannot open this file, or how it will (`Remote SSH`). */
  metadata?: string
}

function isApplicationEntry(
  entry: OpenInMenuEntry
): entry is OpenInMenuEntry & { command: string } {
  return entry.target === 'external-editor' && typeof entry.command === 'string'
}

/** The applications of the worktree Open in menu, judged against the host that owns the file. */
export function getExternalEditorFileOpenEntries(
  openInApplications: readonly OpenInApplication[],
  target: ExternalEditorFileTarget
): ExternalEditorFileOpenEntry[] {
  return getWorktreeOpenInEntries(openInApplications, '')
    .filter(isApplicationEntry)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      command: entry.command,
      ...getOpenInEntryAvailability(
        entry,
        target.connectionId,
        target.runtimeEnvironmentId,
        target.ownerUnresolved
      )
    }))
}

/** The last chosen application when it can still open the file, else the first that can. */
export function pickDefaultExternalEditorFileOpenEntry(
  entries: readonly ExternalEditorFileOpenEntry[],
  lastApplicationId: string | null
): ExternalEditorFileOpenEntry | null {
  const available = entries.filter((entry) => !entry.disabled)
  return available.find((entry) => entry.id === lastApplicationId) ?? available[0] ?? null
}
