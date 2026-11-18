import { getConnectionIdFromState } from '@/lib/connection-context'
import { getRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import { isWebClientLocation } from '@/lib/web-client-location'
import { canReadRelativeRuntimeFile } from '@/runtime/runtime-file-routing'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { AppState } from '@/store/types'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'

/** Where Git annotates an open editor file: its worktree and the host that owns it. */
export type GitAnnotateFileContext = {
  worktreeId: string
  relativePath: string
  /** Identifies the host for the remembered answer to "does it know the annotate queries". */
  hostKey: string
  /** Another Orca answers for this host, and it can be older than this app. */
  remoteHost: boolean
  gitContext: RuntimeGitContext
}

/** Null where Git has nothing to say: folder workspaces, diff tabs, files outside the worktree. */
export function resolveGitAnnotateFileContext(
  state: AppState,
  fileId: string
): GitAnnotateFileContext | null {
  const file = state.openFiles.find((entry) => entry.id === fileId)
  if (!file || file.mode !== 'edit' || file.externalSshTargetId || file.terminalArtifactGrantId) {
    return null
  }
  if (parseWorkspaceKey(file.worktreeId)?.type === 'folder') {
    return null
  }
  const worktree = findWorktreeById(state.worktreesByRepo, file.worktreeId)
  const repo = worktree ? getIndexedRepoMap(state.repos).get(worktree.repoId) : undefined
  if (!worktree || !repo || isFolderRepo(repo)) {
    return null
  }
  const relativePath = file.relativePath
  if (!canReadRelativeRuntimeFile(relativePath) || relativePath.startsWith('..')) {
    return null
  }
  const target = getRuntimeTargetForFileOwner(state, file.worktreeId, file.runtimeEnvironmentId)
  if (!target) {
    return null
  }
  return {
    worktreeId: file.worktreeId,
    relativePath,
    hostKey: target.kind === 'environment' ? `env:${target.environmentId}` : 'local',
    remoteHost: target.kind === 'environment' || isWebClientLocation(),
    gitContext: {
      target,
      worktreeId: file.worktreeId,
      worktreePath: worktree.path,
      connectionId: getConnectionIdFromState(state, file.worktreeId) ?? undefined
    }
  }
}
