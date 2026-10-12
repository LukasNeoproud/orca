import { checkIgnoredPaths } from '../../../git/check-ignored-paths'
import { lstat } from 'node:fs/promises'
import type { CreateWorktreeArgs } from '../../../../shared/worktree/create-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Store } from '../../../persistence'
import { gitExecFileAsync } from '../../../git/runner'
import { listWorktrees } from '../../../git/worktree'
import { resolveDefaultBaseRefViaExec } from '../../../git/repo'
import { SshHostNotServedError } from '../../../providers/ssh-host-not-served-error'
import {
  getLocalProjectWorktreeGitOptions,
  getWorktreeMirrorDistro
} from '../../../project-runtime-git-options'
import { requireWorktreeCreateRoute } from '../../../worktree-create-execution-host-route'
import { computeWorktreePathAsync, getWorktreePathSettings } from '../../worktree-logic'
import { isENOENT } from '../../filesystem-path-containment'
import { previewExplicitWorktreeCreation } from '../../../worktree-explicit-creation'

export async function previewWorktreeCreation(
  args: Pick<CreateWorktreeArgs, 'explicitCreation' | 'baseBranch'>,
  repo: Repo,
  store: Store,
  strictNewBranch = false
) {
  if (!args.explicitCreation) {
    throw new Error('Explicit creation options are required.')
  }
  const route = requireWorktreeCreateRoute(repo)
  if (route.kind === 'ssh') {
    throw new SshHostNotServedError(route.connectionId)
  }
  const options = getLocalProjectWorktreeGitOptions(store, repo)
  const exec = (argv: string[]) => gitExecFileAsync(argv, { cwd: repo.path, ...options })
  const settings = getWorktreePathSettings(
    { ...repo, worktreeBasePath: undefined },
    store.getSettings(),
    getWorktreeMirrorDistro(store, repo)
  )
  const exists = async (path: string, symbolicLinkOnly: boolean): Promise<boolean> => {
    try {
      const stat = await lstat(path)
      return !symbolicLinkOnly || stat.isSymbolicLink()
    } catch (error) {
      if (isENOENT(error)) {
        return false
      }
      throw error
    }
  }
  return previewExplicitWorktreeCreation(
    args.explicitCreation,
    args.baseBranch,
    {
      repoPath: repo.path,
      configuredBase: repo.worktreeBaseRef || undefined,
      defaultBase: () => resolveDefaultBaseRefViaExec(exec),
      defaultPath: (directory, mainPath = repo.path) =>
        computeWorktreePathAsync(directory, mainPath, settings),
      exec,
      worktrees: () => listWorktrees(repo.path, options),
      isIgnored: async (relative, mainPath) =>
        (await checkIgnoredPaths(mainPath, [relative], options)).length > 0,
      isSymbolicLink: (path) => exists(path, true),
      exists: (path) => exists(path, false)
    },
    strictNewBranch
  )
}
