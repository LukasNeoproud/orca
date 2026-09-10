import { checkIgnoredPaths } from '../../../git/check-ignored-paths'
import { lstat } from 'node:fs/promises'
import type { CreateWorktreeArgs } from '../../../../shared/worktree/create-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Store } from '../../../persistence'
import { gitExecFileAsync } from '../../../git/runner'
import { listWorktrees } from '../../../git/worktree'
import { resolveDefaultBaseRefViaExec } from '../../../git/repo'
import { requireSshGitProvider } from '../../../providers/ssh-git-dispatch'
import { requireSshFilesystemProvider } from '../../../providers/ssh-filesystem-dispatch'
import {
  getLocalProjectWorktreeGitOptions,
  getWorktreeMirrorDistro
} from '../../../project-runtime-git-options'
import { requireWorktreeCreateRoute } from '../../../worktree-create-execution-host-route'
import {
  computeWorktreePathAsync,
  computeRemoteWorktreePath,
  getWorktreePathSettings
} from '../../worktree-logic'
import { isENOENT } from '../../filesystem-path-containment'
import { registerRequiredSshWorktreeCreateRoots } from '../../ssh-worktree-create-root-registration'
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
  const ssh = route.kind === 'ssh' ? requireSshGitProvider(route.repo.connectionId!) : undefined
  const fs =
    route.kind === 'ssh' ? requireSshFilesystemProvider(route.repo.connectionId!) : undefined
  if (route.kind === 'ssh') {
    await registerRequiredSshWorktreeCreateRoots(route.repo.connectionId!, [repo.path])
  }
  const options = getLocalProjectWorktreeGitOptions(store, repo)
  const exec = (argv: string[]) =>
    ssh ? ssh.exec(argv, repo.path) : gitExecFileAsync(argv, { cwd: repo.path, ...options })
  const settings = getWorktreePathSettings(
    { ...repo, worktreeBasePath: undefined },
    store.getSettings(),
    ssh ? undefined : getWorktreeMirrorDistro(store, repo)
  )
  return previewExplicitWorktreeCreation(
    args.explicitCreation,
    args.baseBranch,
    {
      repoPath: repo.path,
      configuredBase: repo.worktreeBaseRef || undefined,
      defaultBase: () => resolveDefaultBaseRefViaExec(exec),
      defaultPath: (directory, mainPath = repo.path) =>
        ssh
          ? computeRemoteWorktreePath(directory, mainPath, settings, {
              useConfiguredAbsolutePath: false
            })
          : computeWorktreePathAsync(directory, mainPath, settings),
      exec,
      worktrees: () => (ssh ? ssh.listWorktrees(repo.path) : listWorktrees(repo.path, options)),
      isIgnored: async (relative, mainPath) => {
        const ignored = ssh
          ? await ssh.checkIgnoredPaths(mainPath, [relative])
          : await checkIgnoredPaths(mainPath, [relative], options)
        return ignored.length > 0
      },
      isSymbolicLink: async (path) => {
        try {
          if (fs) {
            if (!fs.lstat) {
              throw new Error(
                'This SSH host does not support safe destination inspection. Reconnect to update it.'
              )
            }
            return (await fs.lstat(path)).type === 'symlink'
          }
          return (await lstat(path)).isSymbolicLink()
        } catch (error) {
          if (isENOENT(error)) {
            return false
          }
          throw error
        }
      },
      exists: async (path) => {
        try {
          await (fs
            ? fs.lstat
              ? fs.lstat(path)
              : Promise.reject(
                  new Error(
                    'This SSH host does not support safe destination inspection. Reconnect to update it.'
                  )
                )
            : lstat(path))
          return true
        } catch (error) {
          if (isENOENT(error)) {
            return false
          }
          throw error
        }
      }
    },
    strictNewBranch
  )
}
