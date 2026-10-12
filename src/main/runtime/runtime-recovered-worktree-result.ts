import { invalidateAuthorizedRootsCache } from '../ipc/filesystem-auth'
import type { CreateWorktreeResult } from '../../shared/worktree/create-types'
import type { GitWorktreeInfo, Worktree } from '../../shared/worktree/types'
import type { AddWorktreeResult } from '../git/worktree'
import type { RuntimeManagedWorktreeCreateArgs } from './runtime-managed-worktree-create-types'

type RecoveredWorktreeRuntime = {
  invalidateResolvedWorktreeCache(): void
  invalidateWorktreeScanCacheForRepo(repoId: string): void
  notifyWorktreesChanged(repoId: string): void
  emitWorktreeLifecycle(event: {
    kind: 'created'
    worktreeId: string
    path: string
    branch: string
  }): void
}

type RecoveredLocalCreate = {
  worktree: Worktree
  created: GitWorktreeInfo
  addResult: AddWorktreeResult
  metadataResult: Pick<CreateWorktreeResult, 'lineage' | 'workspaceLineage' | 'warnings'>
  includeCopyWarning?: string
}

/** A recovered checkout skips setup and startup, so it reports the bare created worktree. */
export function recoveredRuntimeWorktreeResult(
  runtime: RecoveredWorktreeRuntime,
  repoId: string,
  localCreate: RecoveredLocalCreate,
  lineageInput: unknown,
  request: RuntimeManagedWorktreeCreateArgs
): CreateWorktreeResult {
  const args = {
    runtime,
    repoId,
    ...localCreate,
    includeLineage: Boolean(lineageInput),
    request
  }
  args.runtime.invalidateResolvedWorktreeCache()
  args.runtime.invalidateWorktreeScanCacheForRepo(args.repoId)
  invalidateAuthorizedRootsCache()
  args.runtime.notifyWorktreesChanged(args.repoId)
  args.runtime.emitWorktreeLifecycle({
    kind: 'created',
    worktreeId: args.worktree.id,
    path: args.worktree.path,
    branch: args.worktree.branch
  })
  const { lineage, workspaceLineage, warnings } = args.metadataResult
  return {
    worktree: {
      ...args.worktree,
      parentWorktreeId: lineage?.parentWorktreeId ?? null,
      childWorktreeIds: [],
      lineage,
      workspaceLineage,
      git: args.created
    },
    ...(args.includeLineage ? { lineage, workspaceLineage, warnings } : {}),
    checkoutWarning: args.addResult.checkoutWarning,
    ...(args.includeCopyWarning ? { warning: args.includeCopyWarning } : {}),
    ...(args.addResult.localBaseRefRefresh
      ? { localBaseRefRefresh: args.addResult.localBaseRefRefresh }
      : {}),
    ...(args.addResult.localBaseRefUpdateSuggestion
      ? { localBaseRefUpdateSuggestion: args.addResult.localBaseRefUpdateSuggestion }
      : {}),
    ...(args.request.awaitTerminalProvisioning
      ? {
          setupReceipt: {
            requested: args.request.setupDecision ?? 'inherit',
            hookFound: false,
            startupPolicy: 'start-immediately',
            state: 'skipped'
          }
        }
      : {})
  }
}
