import { realpath } from 'node:fs/promises'
import { runProcess } from '@orca/process-host'
import {
  buildWslCapturedLoginShellCommand,
  buildWslExecArgs,
  quotePosixShell
} from '../../shared/wsl-login-shell-command'
import { resolveWslInteropSpawnCwd } from '../wsl-interop-spawn-directory'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { BacklogTarget } from '../backlog/backlog-service'
import { parseExecutionHostId } from '../../shared/execution-host'
import { SshHostNotServedError } from '../providers/ssh-host-not-served-error'
import { resolveWorktreeHostRouting } from '../runtime/worktree-launch-host-repo'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { parseWslPath, toLinuxPath } from '../wsl'
import { spawnBacklogProcess, type BacklogProcessRoute } from './backlog-process'

export type ResolvedBacklogTarget = {
  kind: 'local'
  target: BacklogTarget
  workspaceId: string
  executionHostId: string
}

async function canonicalWslCwd(distro: string, cwd: string): Promise<string> {
  const captured = buildWslCapturedLoginShellCommand(`cd ${quotePosixShell(cwd)} && pwd -P`)
  const result = await runProcess({
    program: 'wsl.exe',
    args: buildWslExecArgs(distro, ['sh', '-c', captured.command]),
    cwd: resolveWslInteropSpawnCwd(),
    timeoutMs: 15_000,
    maxOutputBytes: 64 * 1024
  })
  const path = captured.readStdout(result.stdout)?.trim()
  if (result.code !== 0 || !path || !path.startsWith('/')) {
    throw new Error('backlog_wsl_workspace_unavailable')
  }
  return path
}

export async function resolveBacklogTarget(
  runtime: OrcaRuntimeService,
  workspaceId: string,
  expectedExecutionHostId?: string
): Promise<ResolvedBacklogTarget> {
  const worktree = await runtime.showManagedTerminalWorkspace(`id:${workspaceId}`)
  const parsedKey = parseWorkspaceKey(workspaceId)
  const host =
    parsedKey?.type === 'folder'
      ? parseExecutionHostId(worktree.hostId)
      : (() => {
          const routing = resolveWorktreeHostRouting(runtime.listRepos(), worktree)
          if (routing.kind !== 'resolved') {
            throw new Error('backlog_execution_host_unresolved')
          }
          return parseExecutionHostId(routing.hostId)
        })()
  if (!host) {
    throw new Error('backlog_execution_host_unresolved')
  }
  const expectedHostMatches =
    !expectedExecutionHostId ||
    expectedExecutionHostId === host.id ||
    (host.kind === 'local' && parseExecutionHostId(expectedExecutionHostId)?.kind === 'runtime')
  if (!expectedHostMatches) {
    throw new Error('backlog_execution_host_mismatch')
  }
  if (host.kind === 'runtime') {
    throw new Error('backlog_runtime_host_must_be_called_directly')
  }
  if (host.kind === 'ssh') {
    // An SSH workspace's Backlog runs in the orcad that serves it; this app has no SSH route.
    throw new SshHostNotServedError(host.targetId)
  }

  const projectRuntime = runtime.resolveProjectRuntimeForWorktree(workspaceId)
  if (projectRuntime?.status === 'repair-required') {
    throw new Error(`Project runtime requires repair: ${projectRuntime.repair.reason}`)
  }
  let route: BacklogProcessRoute
  if (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') {
    if (process.platform !== 'win32') {
      throw new Error('backlog_wsl_requires_windows')
    }
    const distro = projectRuntime.runtime.distro
    const parsedPath = parseWslPath(worktree.path)
    if (parsedPath && parsedPath.distro.toLowerCase() !== distro.toLowerCase()) {
      throw new Error('backlog_wsl_distro_mismatch')
    }
    route = {
      kind: 'wsl',
      distro,
      cwd: await canonicalWslCwd(distro, parsedPath?.linuxPath ?? toLinuxPath(worktree.path))
    }
  } else {
    route = { kind: 'native', cwd: await realpath(worktree.path) }
  }
  const key = `${host.id}\0${route.kind === 'wsl' ? route.distro : ''}\0${route.cwd}`
  return {
    kind: 'local',
    workspaceId: worktree.id,
    executionHostId: host.id,
    target: { key, spawn: (args) => spawnBacklogProcess(route, args) }
  }
}
