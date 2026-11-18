import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getRouteForLocalPathOpenOwner, type LocalPathOpenOwner } from '@/lib/local-path-open-guard'
import { getWorkspaceFileRevealOwner } from '@/lib/reveal-in-file-manager'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'

/** A workspace file as an editor or diff shows it. */
export type ExternalEditorFileSource = {
  /** Absolute path inside the workspace the file is shown in, never the main checkout. */
  filePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  externalSshTargetId?: string
}

export type ExternalEditorFileTarget = {
  filePath: string
  /** Repository or folder workspace whose last chosen application is the default. */
  preferenceKey: string
  connectionId: string | null
  runtimeEnvironmentId: string | null
  ownerUnresolved: boolean
}

type FileOwner = Exclude<LocalPathOpenOwner, object>

function getFileOwner(state: AppState, source: ExternalEditorFileSource): FileOwner {
  return getWorkspaceFileRevealOwner(state, source.worktreeId, {
    connectionId: source.externalSshTargetId ?? getConnectionIdFromState(state, source.worktreeId),
    runtimeEnvironmentId: source.runtimeEnvironmentId
  })
}

function getPreferenceKey(worktreeId: string): string {
  // Why: a folder workspace has no repository, so it remembers its own choice.
  return parseWorkspaceKey(worktreeId)?.type === 'folder'
    ? worktreeId
    : getRepoIdFromWorktreeId(worktreeId)
}

function buildTarget(source: ExternalEditorFileSource, owner: FileOwner): ExternalEditorFileTarget {
  return {
    filePath: source.filePath,
    preferenceKey: getPreferenceKey(source.worktreeId),
    ...getRouteForLocalPathOpenOwner(owner)
  }
}

export function getExternalEditorFileTarget(
  state: AppState,
  source: ExternalEditorFileSource
): ExternalEditorFileTarget {
  return buildTarget(source, getFileOwner(state, source))
}

export function useExternalEditorFileTarget(
  source: ExternalEditorFileSource | null
): ExternalEditorFileTarget | null {
  const filePath = source?.filePath
  const worktreeId = source?.worktreeId
  const runtimeEnvironmentId = source?.runtimeEnvironmentId
  const externalSshTargetId = source?.externalSshTargetId
  const stableSource = useMemo(
    () =>
      filePath !== undefined && worktreeId !== undefined
        ? { filePath, worktreeId, runtimeEnvironmentId, externalSshTargetId }
        : null,
    [externalSshTargetId, filePath, runtimeEnvironmentId, worktreeId]
  )
  // Why: the owner is a string, so the selector stays stable across unrelated store writes.
  const owner = useAppStore((s) => (stableSource ? getFileOwner(s, stableSource) : 'unresolved'))
  return useMemo(
    () => (stableSource ? buildTarget(stableSource, owner) : null),
    [owner, stableSource]
  )
}
