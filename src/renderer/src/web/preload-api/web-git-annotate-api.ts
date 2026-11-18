import type { PreloadApi } from '../../../../preload/api-types'
import { toRuntimeWorktreeSelector } from '../../runtime/runtime-worktree-selector'
import { callRuntimeResult } from './web-runtime-calls'
import { resolveRuntimeWorktreeByPath } from './web-runtime-worktree-catalog'

export function createGitAnnotateApi(): NonNullable<Partial<PreloadApi>['gitAnnotate']> {
  return {
    blame: async ({ worktreePath, relativePath, contents }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeResult('git.blame', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        relativePath,
        contents
      })
    },
    lineHistory: async ({ worktreePath, relativePath, startLine, endLine, limit }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeResult('git.lineHistory', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        relativePath,
        startLine,
        endLine,
        limit
      })
    }
  }
}
