import { appendFile } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import type { CreateWorktreeArgs } from '../../../../shared/worktree/create-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Store } from '../../../persistence'
import { previewWorktreeCreation } from './explicit-creation-preview'
import { gitExecFileAsync } from '../../../git/runner'
import { getLocalProjectWorktreeGitOptions } from '../../../project-runtime-git-options'
import { listWorktrees } from '../../../git/worktree'
import { toWindowsWslPath } from '../../../wsl'

export async function ignoreCreationLocally(
  args: Pick<CreateWorktreeArgs, 'explicitCreation' | 'baseBranch'>,
  repo: Repo,
  store: Store
): Promise<void> {
  // The preview refuses hosts this app does not serve, before anything is written.
  const preview = await previewWorktreeCreation(args, repo, store)
  if (!preview.needsLocalIgnore) {
    return
  }
  const options = getLocalProjectWorktreeGitOptions(store, repo)
  const worktrees = await listWorktrees(repo.path, options)
  const mainPath = worktrees[0]?.path || repo.path
  const pathOps = /^[A-Za-z]:[\\/]|^\\\\/.test(mainPath) ? win32 : posix
  const relative = pathOps.relative(mainPath, preview.path).replace(/\\/g, '/')
  if (!relative || relative.startsWith('../') || pathOps.isAbsolute(relative)) {
    throw new Error('Only an in-repository destination can be ignored locally.')
  }
  const { stdout } = await gitExecFileAsync(['rev-parse', '--git-path', 'info/exclude'], {
    cwd: mainPath,
    ...options
  })
  let excludePath = stdout.trim()
  if (options.wslDistro && excludePath.startsWith('/')) {
    excludePath = toWindowsWslPath(excludePath, options.wslDistro)
  }
  excludePath = pathOps.resolve(mainPath, excludePath)
  const pattern = `\n/${relative.replace(/([*?[\\])/g, '\\$1')}/\n`
  await appendFile(excludePath, pattern, 'utf8')
}
