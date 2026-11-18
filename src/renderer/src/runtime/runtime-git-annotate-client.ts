import type { GitBlameOptions, GitBlameResult } from '../../../shared/git-blame'
import type { GitLineHistoryOptions, GitLineHistoryResult } from '../../../shared/git-line-history'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from './runtime-rpc-client'
import { hasRuntimeRpcErrorCode } from './runtime-rpc-result'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

/** The host runs an Orca that predates `git.blame` and `git.lineHistory`. */
export function isGitAnnotateUnsupportedHostError(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, 'method_not_found')
}

export async function getRuntimeGitBlame(
  context: RuntimeGitContext,
  options: GitBlameOptions
): Promise<GitBlameResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.gitAnnotate.blame({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...options
    })
  }
  return callRuntimeRpc<GitBlameResult>(
    target,
    'git.blame',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), ...options },
    { timeoutMs: 30_000 }
  )
}

export async function getRuntimeGitLineHistory(
  context: RuntimeGitContext,
  options: GitLineHistoryOptions
): Promise<GitLineHistoryResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.gitAnnotate.lineHistory({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...options
    })
  }
  return callRuntimeRpc<GitLineHistoryResult>(
    target,
    'git.lineHistory',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), ...options },
    { timeoutMs: 30_000 }
  )
}
