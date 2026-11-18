import type { GitBlameOptions, GitBlameResult } from '../../shared/git-blame'
import { loadGitBlameFromExecutor } from '../../shared/git-blame'
import type { GitLineHistoryOptions, GitLineHistoryResult } from '../../shared/git-line-history'
import { loadGitLineHistoryFromExecutor } from '../../shared/git-line-history'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

export async function getBlame(
  worktreePath: string,
  options: GitBlameOptions & GitRuntimeOptions
): Promise<GitBlameResult> {
  return loadGitBlameFromExecutor(
    (args, cwd, stdin) => gitExecFileAsync(args, { ...gitOptionsForWorktree(cwd, options), stdin }),
    worktreePath,
    options
  )
}

export async function getLineHistory(
  worktreePath: string,
  options: GitLineHistoryOptions & GitRuntimeOptions
): Promise<GitLineHistoryResult> {
  return loadGitLineHistoryFromExecutor(
    (args, cwd) => gitExecFileAsync(args, gitOptionsForWorktree(cwd, options)),
    worktreePath,
    options
  )
}
