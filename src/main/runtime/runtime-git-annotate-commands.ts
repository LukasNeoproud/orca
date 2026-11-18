import type { GitBlameResult } from '../../shared/git-blame'
import type { GitLineHistoryResult, GitLineRange } from '../../shared/git-line-history'
import {
  normalizeRuntimeGitRelativePath,
  requireRuntimeGitProvider,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'

export class RuntimeGitAnnotateCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async getRuntimeGitBlame(
    worktreeSelector: string,
    relativePath: string,
    contents: string
  ): Promise<GitBlameResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return requireRuntimeGitProvider(target).getBlame(target.worktree.path, {
      relativePath: normalizeRuntimeGitRelativePath(relativePath),
      contents
    })
  }

  async getRuntimeGitLineHistory(
    worktreeSelector: string,
    relativePath: string,
    range: GitLineRange,
    limit?: number
  ): Promise<GitLineHistoryResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return requireRuntimeGitProvider(target).getLineHistory(target.worktree.path, {
      relativePath: normalizeRuntimeGitRelativePath(relativePath),
      startLine: range.startLine,
      endLine: range.endLine,
      limit
    })
  }
}
