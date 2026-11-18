import type {
  GitBranchListResult,
  GitDeleteBranchRequest,
  GitDeleteBranchResult
} from '../../shared/git-branch-list'
import { deleteBranch, listBranches, renameBranch } from '../git/branch-list'
import { runWithGitReadCacheInvalidation } from '../git/status'
import {
  localGitOptionsForTarget,
  requireRuntimeGitProvider,
  type RuntimeGitCommandHost,
  type RuntimeGitTarget
} from './runtime-git-command-target'

export class RuntimeBranchListCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  private async target(selector: string): Promise<RuntimeGitTarget> {
    const target = await this.host.resolveRuntimeGitTarget(selector)
    // Refuses hosts this app does not serve; the list runs this machine's Git.
    requireRuntimeGitProvider(target)
    return target
  }

  async listRuntimeGitBranches(selector: string): Promise<GitBranchListResult> {
    const target = await this.target(selector)
    return listBranches(target.worktree.path, localGitOptionsForTarget(target))
  }

  async deleteRuntimeGitBranch(
    selector: string,
    request: GitDeleteBranchRequest
  ): Promise<GitDeleteBranchResult> {
    const target = await this.target(selector)
    return runWithGitReadCacheInvalidation(() =>
      deleteBranch(target.worktree.path, request, localGitOptionsForTarget(target))
    )
  }

  async renameRuntimeGitBranch(
    selector: string,
    name: string,
    newName: string
  ): Promise<{ ok: true }> {
    const target = await this.target(selector)
    await runWithGitReadCacheInvalidation(() =>
      renameBranch(target.worktree.path, name, newName, localGitOptionsForTarget(target))
    )
    return { ok: true }
  }
}
