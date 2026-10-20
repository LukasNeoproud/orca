import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isPathInsideWorktree } from '@/lib/terminal-links'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { createNewTerminalTab } from '@/components/terminal/terminal-tab-create'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'

/** What a directory link does: show it in Orca's file explorer, or start a terminal in it. */
export type TerminalDirectoryLinkAction = 'reveal' | 'terminal'

export type TerminalDirectoryLinkOwner = {
  /** The workspace that owns the link: the host's resolution, else the pane's own. */
  worktreeId: string
  worktreePath: string
  executionHostId?: ExecutionHostId
  canOpenWithSystemDefault: boolean
}

function trimTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  return trimmed.length > 0 && !/^[A-Za-z]:$/.test(trimmed) ? trimmed : path
}

function activateIfNeeded(target: TerminalDirectoryLinkOwner): void {
  if (useAppStore.getState().activeWorktreeId === target.worktreeId) {
    return
  }
  activateAndRevealWorkspace(target.worktreeId, { executionHostId: target.executionHostId })
}

export async function openTerminalDirectoryLink(
  linkPath: string,
  /** Unset shows the folder in the file explorer. */
  action: TerminalDirectoryLinkAction | undefined,
  target: TerminalDirectoryLinkOwner
): Promise<void> {
  const directoryPath = trimTrailingSeparators(linkPath)
  const insideWorkspace =
    target.worktreePath.length > 0 && isPathInsideWorktree(directoryPath, target.worktreePath)

  if (action === 'terminal') {
    // Why the pane's workspace for an outside folder: a shell can start anywhere on its host.
    activateIfNeeded(target)
    createNewTerminalTab(target.worktreeId, undefined, {
      startupCwd: directoryPath
    })
    return
  }

  if (insideWorkspace) {
    activateIfNeeded(target)
    const store = useAppStore.getState()
    store.revealInExplorer(target.worktreeId, directoryPath)
    // Why expand it too: the link names the folder, so its contents are what the user came for.
    useAppStore.setState((state) => {
      const expanded = new Set(state.expandedDirs[target.worktreeId] ?? [])
      expanded.add(directoryPath)
      return {
        expandedDirs: { ...state.expandedDirs, [target.worktreeId]: expanded }
      }
    })
    return
  }

  if (target.canOpenWithSystemDefault) {
    await window.api.shell.openFilePath(directoryPath, LOCAL_EXECUTION_HOST_ID)
    return
  }
  toast.info(
    translate(
      'auto.components.terminal.pane.TerminalLinkActionPopover.folderOutsideWorkspace',
      'This folder is outside the workspace, so the file explorer cannot show it.'
    )
  )
}
