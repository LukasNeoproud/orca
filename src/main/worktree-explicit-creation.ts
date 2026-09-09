import { posix, win32 } from 'node:path'
import { resolveGitRemoteRebaseSource } from '../shared/git-rebase-source'
import { ExplicitWorktreeCreationSchema } from '../shared/worktree/explicit-creation'
import type {
  ExplicitWorktreeCreation,
  WorktreeCreationPreview
} from '../shared/worktree/explicit-creation'

type ResolvedCreationPreview = WorktreeCreationPreview & {
  trackingTarget?: { remoteName: string; branchName: string }
}

export type ExplicitCreationHost = {
  repoPath: string
  configuredBase?: string
  defaultPath: (directory: string, mainPath?: string) => string | Promise<string>
  defaultBase: () => Promise<string | null>
  exec: (args: string[]) => Promise<{ stdout: string }>
  worktrees: () => Promise<{ path: string; branch: string }[]>
  exists: (path: string) => Promise<boolean>
  isIgnored?: (relativePath: string, mainPath: string) => Promise<boolean>
  isSymbolicLink?: (path: string) => Promise<boolean>
}

export function validateExplicitDirectory(directory: string): void {
  if (directory.includes('\\') || directory.startsWith('/') || directory.length > 1024) {
    throw new Error('Use a relative directory with forward slashes.')
  }
  for (const segment of directory.split('/')) {
    if (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      /[<>:"|?*]/.test(segment) ||
      [...segment].some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(segment) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment) ||
      segment.toLowerCase() === '.git' ||
      segment.length > 255
    ) {
      throw new Error(`Unsupported worktree directory segment: "${segment}".`)
    }
  }
}

export async function previewExplicitWorktreeCreation(
  raw: ExplicitWorktreeCreation,
  requestedBase: string | undefined,
  host: ExplicitCreationHost,
  strictNewBranch = false
): Promise<ResolvedCreationPreview> {
  const explicit = ExplicitWorktreeCreationSchema.parse(raw)
  const { branch, destination } = explicit
  validateExplicitDirectory(destination.relativeDirectory)
  if (
    branch.name.startsWith('-') ||
    branch.name !== branch.name.trim() ||
    branch.name.includes('@{')
  ) {
    throw new Error('Invalid branch name.')
  }
  await host.exec(['check-ref-format', '--branch', branch.name])
  const hasRef = async (ref: string): Promise<boolean> => {
    const { stdout } = await host.exec(['for-each-ref', '--format=%(refname)', ref])
    return stdout.trim().split('\n').includes(ref)
  }
  const localExists = await hasRef(`refs/heads/${branch.name}`)
  if (branch.kind === 'new' && localExists) {
    if (strictNewBranch) {
      throw new Error('This branch now exists. Refresh and select the existing branch.')
    }
    branch.kind = 'local'
  }
  if (branch.kind === 'local' && !localExists) {
    throw new Error('This local branch no longer exists. Refresh the branch list.')
  }
  if (branch.kind === 'remote' && localExists) {
    throw new Error('A local branch with this name exists. Select that local branch instead.')
  }
  let baseBranch: string
  let trackingTarget: ResolvedCreationPreview['trackingTarget']
  if (branch.kind === 'local') {
    baseBranch = `refs/heads/${branch.name}`
  } else if (branch.kind === 'remote') {
    const remoteRef = branch.remoteRef?.replace(/^refs\/remotes\//, '')
    if (!remoteRef || remoteRef.startsWith('-') || !(await hasRef(`refs/remotes/${remoteRef}`))) {
      throw new Error('The selected remote branch no longer exists. Refresh the branch list.')
    }
    baseBranch = `refs/remotes/${remoteRef}`
    const { remoteName, branchName } = await resolveGitRemoteRebaseSource(host.exec, baseBranch)
    trackingTarget = { remoteName, branchName }
  } else {
    baseBranch =
      requestedBase ||
      host.configuredBase ||
      ((await hasRef('refs/heads/master')) ? 'refs/heads/master' : (await host.defaultBase()) || '')
    if (!baseBranch || baseBranch.startsWith('-')) {
      throw new Error('Choose an existing base branch.')
    }
    if (!baseBranch.startsWith('refs/')) {
      if (await hasRef(`refs/heads/${baseBranch}`)) {
        baseBranch = `refs/heads/${baseBranch}`
      } else if (await hasRef(`refs/remotes/${baseBranch}`)) {
        baseBranch = `refs/remotes/${baseBranch}`
      }
    }
    await host.exec(['rev-parse', '--verify', `${baseBranch}^{commit}`])
    const symbolic = (
      await host.exec(['rev-parse', '--symbolic-full-name', baseBranch])
    ).stdout.trim()
    if (symbolic) {
      baseBranch = symbolic
    }
  }
  const worktrees = await host.worktrees()
  const mainPath = worktrees[0]?.path || host.repoPath
  const pathOps = /^[A-Za-z]:[\\/]|^\\\\/.test(mainPath) ? win32 : posix
  let path: string
  if (destination.root) {
    const root = destination.root
    if ([...root].some((character) => character.charCodeAt(0) < 32)) {
      throw new Error('Invalid destination root.')
    }
    path = pathOps.resolve(mainPath, root, ...destination.relativeDirectory.split('/'))
  } else {
    path = await host.defaultPath(destination.relativeDirectory, mainPath)
  }
  if (host.isSymbolicLink) {
    let ancestor = pathOps.dirname(path)
    const selectedRoot = destination.root
      ? pathOps.resolve(mainPath, destination.root)
      : pathOps.dirname(await host.defaultPath('placeholder', mainPath))
    while (ancestor !== selectedRoot && ancestor !== pathOps.dirname(ancestor)) {
      if (await host.isSymbolicLink(ancestor)) {
        throw new Error('Worktree directory must not pass through a symbolic link.')
      }
      ancestor = pathOps.dirname(ancestor)
    }
  }
  const occupyingWorktree = worktrees.find(
    (item) => item.branch.replace(/^refs\/heads\//, '') === branch.name
  )
  const relative = pathOps.relative(mainPath, path)
  let needsLocalIgnore = false
  if (relative && !relative.startsWith('..') && !pathOps.isAbsolute(relative)) {
    const directoryProbe = `${relative.replace(/\\/g, '/')}/`
    if (host.isIgnored) {
      needsLocalIgnore = !(await host.isIgnored(directoryProbe, mainPath))
    } else {
      const result = await host
        .exec(['check-ignore', '--no-index', '--', directoryProbe])
        .catch((error: unknown) => {
          if ((error as { code?: unknown }).code === 1 || /exit code 1/.test(String(error))) {
            return { stdout: '' }
          }
          throw error
        })
      needsLocalIgnore = !result.stdout.trim()
    }
  }
  return {
    branch,
    baseBranch,
    path,
    occupyingWorktree,
    destinationExists: await host.exists(path),
    needsLocalIgnore,
    ...(trackingTarget ? { trackingTarget } : {})
  }
}

export function assertExplicitCreationAvailable(preview: WorktreeCreationPreview): void {
  if (preview.occupyingWorktree) {
    throw new Error(
      `Branch is already checked out at ${preview.occupyingWorktree.path}. Open that worktree instead.`
    )
  }
  if (preview.destinationExists) {
    throw new Error(`Destination already exists: ${preview.path}`)
  }
}

export function explicitCreationTrackingTarget(preview: ResolvedCreationPreview) {
  return preview.trackingTarget
}
