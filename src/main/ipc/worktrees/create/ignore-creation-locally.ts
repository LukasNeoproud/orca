import { appendFile } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import type { CreateWorktreeArgs } from '../../../../shared/worktree/create-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Store } from '../../../persistence'
import { previewWorktreeCreation } from './explicit-creation-preview'
import { requireWorktreeCreateRoute } from '../../../worktree-create-execution-host-route'
import { requireSshGitProvider } from '../../../providers/ssh-git-dispatch'
import { requireSshFilesystemProvider } from '../../../providers/ssh-filesystem-dispatch'
import { gitExecFileAsync } from '../../../git/runner'
import { getLocalProjectWorktreeGitOptions } from '../../../project-runtime-git-options'
import { listWorktrees } from '../../../git/worktree'
import { isENOENT } from '../../filesystem-path-containment'
import { toWindowsWslPath } from '../../../wsl'

export async function ignoreCreationLocally(
  args: Pick<CreateWorktreeArgs, 'explicitCreation' | 'baseBranch'>,
  repo: Repo,
  store: Store
): Promise<void> {
  const preview = await previewWorktreeCreation(args, repo, store)
  if (!preview.needsLocalIgnore) {
    return
  }
  const route = requireWorktreeCreateRoute(repo)
  const ssh = route.kind === 'ssh' ? requireSshGitProvider(route.repo.connectionId!) : undefined
  const options = getLocalProjectWorktreeGitOptions(store, repo)
  const worktrees = ssh
    ? await ssh.listWorktrees(repo.path)
    : await listWorktrees(repo.path, options)
  const mainPath = worktrees[0]?.path || repo.path
  const pathOps = /^[A-Za-z]:[\\/]|^\\\\/.test(mainPath) ? win32 : posix
  const relative = pathOps.relative(mainPath, preview.path).replace(/\\/g, '/')
  if (!relative || relative.startsWith('../') || pathOps.isAbsolute(relative)) {
    throw new Error('Only an in-repository destination can be ignored locally.')
  }
  const argv = ['rev-parse', '--git-path', 'info/exclude']
  const { stdout } = ssh
    ? await ssh.exec(argv, mainPath)
    : await gitExecFileAsync(argv, { cwd: mainPath, ...options })
  let excludePath = stdout.trim()
  if (!ssh && options.wslDistro && excludePath.startsWith('/')) {
    excludePath = toWindowsWslPath(excludePath, options.wslDistro)
  }
  excludePath = pathOps.resolve(mainPath, excludePath)
  const pattern = `\n/${relative.replace(/([*?[\\])/g, '\\$1')}/\n`
  if (route.kind === 'ssh') {
    const fs = requireSshFilesystemProvider(route.repo.connectionId!)
    const existing = await fs.readFile(excludePath).then(
      (result) => result.content,
      (error: unknown) => {
        if (isENOENT(error)) {
          return ''
        }
        throw error
      }
    )
    await fs.writeFile(excludePath, existing + pattern)
  } else {
    await appendFile(excludePath, pattern, 'utf8')
  }
}
