import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBranchManagementSessions } from './runtime-branch-management-sessions'
import type { RuntimeGitTarget } from './runtime-git-command-target'
import type { PtyProcessInfo } from '../providers/pty-process-info'
const mocks = vi.hoisted(() => ({ host: vi.fn(), observe: vi.fn() }))
vi.mock('./structured-worker-authority', () => ({ observeStructuredWorker: mocks.observe }))
vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: mocks.host
}))
const target = (executionHostId: 'local' | 'ssh:box'): RuntimeGitTarget =>
  ({ executionHostId, worktree: { id: 'r::/repo', path: '/repo' } }) as RuntimeGitTarget
const idle: PtyProcessInfo = {
  id: 'pty',
  cwd: '/repo',
  title: 'Shell',
  foregroundProcessEvidence: {
    verdict: 'live',
    processName: 'zsh',
    shellOwnsEveryTtyProcessGroup: true,
    authorityGeneration: 'a',
    observationEpoch: 1,
    capturedAgeMs: 0
  }
}
beforeEach(() => {
  mocks.host.mockReturnValue(null)
  mocks.observe.mockReturnValue({ status: 'live' })
})
describe('branch management execution-host process proof', () => {
  it.each([true, false])(
    'matches Windows terminal ownership with explicit ID %s',
    async (explicit) => {
      const windowsTarget = {
        ...target('local'),
        worktree: { id: 'r::C:/repo', path: 'C:/repo' }
      } as RuntimeGitTarget
      const listProcesses = vi.fn(async () => [
        {
          id: 'r::C:\\repo@@session',
          ...(explicit ? { worktreeId: 'r::C:\\repo' } : {}),
          cwd: 'C:/elsewhere',
          title: 'Agent'
        }
      ])
      expect(await getBranchManagementSessions({ listProcesses }, windowsTarget)).toEqual([
        'unverifiable: Agent'
      ])
    }
  )
  it('matches normalized structured ownership while keeping execution hosts isolated', async () => {
    const windowsTarget = {
      ...target('local'),
      worktree: { id: 'r::C:/repo', path: 'C:/repo' }
    } as RuntimeGitTarget
    mocks.host.mockReturnValue({
      deps: {
        store: {
          listRecords: () => [
            {
              sessionId: 'mine',
              provider: 'codex',
              location: { workspaceId: 'r::C:\\repo', executionHostId: 'local' }
            },
            {
              sessionId: 'other',
              provider: 'claude',
              location: { workspaceId: 'r::C:\\repo', executionHostId: 'ssh:box' }
            }
          ]
        }
      }
    })
    expect(
      await getBranchManagementSessions({ listProcesses: vi.fn(async () => []) }, windowsTarget)
    ).toEqual(['live: codex'])
    expect(mocks.observe).toHaveBeenCalledExactlyOnceWith({ sessionId: 'mine' })
  })
  it('allows host-proven idle shells and scopes local inventory explicitly', async () => {
    const listProcesses = vi.fn(async () => [idle])
    expect(await getBranchManagementSessions({ listProcesses }, target('local'))).toEqual([])
    expect(listProcesses).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ includeForegroundProcessEvidence: true })
    )
  })
  it('reports disconnected SSH inventory as unverifiable, never as no sessions', async () => {
    const listProcesses = vi.fn(async () => {
      throw new Error('Disconnected')
    })
    expect(await getBranchManagementSessions({ listProcesses }, target('ssh:box'))).toBeNull()
    expect(listProcesses).toHaveBeenCalledWith('ssh:box', expect.any(Object))
  })
  it('blocks older-host unknown foreground evidence', async () => {
    const listProcesses = vi.fn(async () => [{ id: 'pty', cwd: '/repo', title: 'Shell' }])
    expect(await getBranchManagementSessions({ listProcesses }, target('local'))).toEqual([
      'unverifiable: Shell'
    ])
  })
  it('does not infer absence when the controller is unavailable', async () => {
    expect(await getBranchManagementSessions(null, target('local'))).toBeNull()
  })
})
