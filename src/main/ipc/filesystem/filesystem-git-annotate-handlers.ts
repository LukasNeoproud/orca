import { ipcMain } from 'electron'
import { sep } from 'node:path'
import type { GitBlameResult } from '../../../shared/git-blame'
import type { GitLineHistoryResult } from '../../../shared/git-line-history'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { getBlame, getLineHistory } from '../../git/annotate'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { validateGitRelativeFilePath } from '../filesystem-path-containment'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'

type AnnotateTarget = { worktreePath: string; relativePath: string; connectionId?: string }

export function registerFilesystemGitAnnotateHandlers(context: FilesystemHandlerContext): void {
  const { store } = context

  async function resolveTarget(args: AnnotateTarget) {
    requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
    const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
    return {
      worktreePath,
      // Why: Git reads the path inside the -L argument, where only forward slashes separate.
      relativePath: validateGitRelativeFilePath(worktreePath, args.relativePath)
        .split(sep)
        .join('/'),
      gitOptions: getLocalGitOptionsForRegisteredWorktree(store, args.worktreePath, worktreePath)
    }
  }

  ipcMain.handle(
    'git:blame',
    async (_event, args: AnnotateTarget & { contents: string }): Promise<GitBlameResult> => {
      const { worktreePath, relativePath, gitOptions } = await resolveTarget(args)
      return getBlame(worktreePath, { relativePath, contents: args.contents, ...gitOptions })
    }
  )

  ipcMain.handle(
    'git:lineHistory',
    async (
      _event,
      args: AnnotateTarget & { startLine: number; endLine: number; limit?: number }
    ): Promise<GitLineHistoryResult> => {
      const { worktreePath, relativePath, gitOptions } = await resolveTarget(args)
      return getLineHistory(worktreePath, {
        relativePath,
        startLine: args.startLine,
        endLine: args.endLine,
        limit: args.limit,
        ...gitOptions
      })
    }
  )
}
