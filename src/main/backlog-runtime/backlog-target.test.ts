import { realpath } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveBacklogTarget } from './backlog-target'
import { SshHostNotServedError } from '../providers/ssh-host-not-served-error'

function runtimeFor(hostId: string | undefined, repoHostId = 'local'): OrcaRuntimeService {
  const workspace = {
    id: 'repo::/work',
    repoId: 'repo',
    path: process.cwd(),
    hostId
  }
  return {
    showManagedTerminalWorkspace: vi.fn(async () => workspace),
    listRepos: () => [{ id: 'repo', path: process.cwd(), executionHostId: repoHostId }],
    resolveProjectRuntimeForWorktree: () => undefined
  } as unknown as OrcaRuntimeService
}

describe('resolveBacklogTarget', () => {
  it('uses the owning runtime workspace path and its canonical host path', async () => {
    const runtime = runtimeFor('local')
    const resolved = await resolveBacklogTarget(runtime, 'repo::/work', 'local')
    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('id:repo::/work')
    expect(resolved).toMatchObject({
      kind: 'local',
      workspaceId: 'repo::/work',
      executionHostId: 'local'
    })
    if (resolved.kind !== 'local') {
      throw new Error('expected local target')
    }
    expect(resolved.target.key).toContain(await realpath(process.cwd()))
  })

  it('rejects a client declaration that conflicts with the owning host', async () => {
    await expect(
      resolveBacklogTarget(runtimeFor('local'), 'repo::/work', 'ssh:other')
    ).rejects.toThrow('backlog_execution_host_mismatch')
  })

  it('refuses a direct SSH owner, whose Backlog only its orcad can serve', async () => {
    await expect(
      resolveBacklogTarget(runtimeFor(undefined, 'ssh:box'), 'repo::/work', 'ssh:box')
    ).rejects.toThrow(SshHostNotServedError)
  })

  it('accepts a paired-runtime routing key only after resolving local ownership', async () => {
    await expect(
      resolveBacklogTarget(runtimeFor('local'), 'repo::/work', 'runtime:dev')
    ).resolves.toMatchObject({ kind: 'local', executionHostId: 'local' })
  })
})
