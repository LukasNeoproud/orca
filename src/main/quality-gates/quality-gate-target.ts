import { parseExecutionHostId } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { QualityGateDefinition } from '../../shared/quality-gate-types'
import { normalizeQualityGateDefinitions } from '../../shared/quality-gate-types'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { getHookRuntimeTarget, getHookWslContext } from '../hook-runtime-target'
import { SshHostNotServedError } from '../providers/ssh-host-not-served-error'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveWorktreeHostRouting } from '../runtime/worktree-launch-host-repo'
import type { QualityGateLaunchTarget } from './quality-gate-launch'
import type { QualityGateSourceTarget } from './quality-gate-source-state'

export type QualityGateTarget = {
  /** Empty for a folder workspace of a project group: no repository settings hold its gates. */
  repoId: string
  worktreeId: string
  worktreePath: string
  gates: QualityGateDefinition[]
  launch: QualityGateLaunchTarget
  source: QualityGateSourceTarget
}

const HOST_UNRESOLVED = 'The host that owns this workspace could not be resolved.'

type TargetRuntime = Pick<
  OrcaRuntimeService,
  'showManagedTerminalWorkspace' | 'listRepos' | 'resolveProjectRuntimeForWorktree'
>

/**
 * Resolve a workspace this host owns to where its gates run. The gates come from this host's own
 * repository settings and from nowhere else: not from the request, not from the worktree.
 *
 * A workspace owned by another host is refused rather than run here: that host's Orca runs the
 * command and keeps the record, and the client calls it directly.
 */
export async function resolveQualityGateTarget(
  runtime: TargetRuntime,
  worktreeSelector: string
): Promise<QualityGateTarget> {
  const worktree = await runtime.showManagedTerminalWorkspace(worktreeSelector)
  const folderWorkspace = parseWorkspaceKey(worktree.id)?.type === 'folder'
  const routing = folderWorkspace ? null : resolveWorktreeHostRouting(runtime.listRepos(), worktree)
  if (routing && routing.kind !== 'resolved') {
    throw new Error(HOST_UNRESOLVED)
  }
  const host = parseExecutionHostId(routing ? routing.hostId : worktree.hostId)
  if (!host) {
    throw new Error(HOST_UNRESOLVED)
  }
  if (host.kind === 'runtime') {
    throw new Error(
      'This workspace belongs to another Orca host. Quality gates run on the host that owns it.'
    )
  }
  if (host.kind === 'ssh') {
    throw new SshHostNotServedError(host.targetId)
  }
  const repo = routing?.repo ?? null
  const wsl = getHookWslContext(
    worktree.path,
    getHookRuntimeTarget(runtime.resolveProjectRuntimeForWorktree(worktree.id))
  )
  return {
    repoId: repo?.id ?? '',
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    // Normalized again on the way out: the store may hold a row written by another build.
    gates: normalizeQualityGateDefinitions(repo?.qualityGates) ?? [],
    launch: wsl
      ? { kind: 'wsl', cwd: wsl.linuxPath, distro: wsl.distro }
      : { kind: 'native', cwd: worktree.path },
    source: {
      path: worktree.path,
      git: repo !== null && !isFolderRepo(repo),
      ...(wsl?.distro ? { wslDistro: wsl.distro } : {})
    }
  }
}
