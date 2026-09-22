import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.call }))

import { classifyPairedProviderOwner } from './backlog-task-paired-terminal-owner'

const association: BacklogTaskAssociation = {
  projectId: 'repo:project',
  executionHostId: 'local',
  taskId: 'TASK-1',
  sourceWorkspace: { workspaceId: 'source', kind: 'git-worktree' },
  targetWorkspace: { workspaceId: 'target', kind: 'git-worktree' },
  session: { providerSession: { key: 'session_id', id: 'provider-1' } },
  terminal: {
    tabId: 'web-terminal-host-tab',
    leafId: 'leaf-1',
    ptyId: 'remote:owner@@term-1',
    launchAgent: 'codex'
  },
  attemptId: 'attempt',
  deliveryStatus: 'unverified',
  createdAt: 1,
  updatedAt: 1
}

function listed(terminals: unknown[] = []) {
  return {
    terminals,
    totalCount: terminals.length,
    truncated: false,
    hostScope: { hostIds: ['local'], omittedHostIds: [] }
  }
}

function terminal(handle = 'term-1') {
  return {
    handle,
    ptyId: 'pty-1',
    incarnationId: 'incarnation-1',
    worktreeId: 'target',
    worktreePath: '/target',
    branch: 'main',
    tabId: 'host-tab',
    leafId: 'leaf-1',
    title: null,
    connected: true,
    writable: true,
    lastOutputAt: null,
    preview: ''
  }
}

function inventory(tabs: unknown[] = []) {
  return {
    authoritative: true,
    snapshots: [
      {
        worktree: 'target',
        publicationEpoch: 'epoch',
        snapshotVersion: 1,
        activeGroupId: null,
        activeTabId: null,
        activeTabType: null,
        tabs
      }
    ]
  }
}

function readyTab(options: { providerId?: string; agent?: string; terminal?: string } = {}) {
  return {
    type: 'terminal',
    id: 'host-tab::leaf-1',
    parentTabId: 'host-tab',
    leafId: 'leaf-1',
    title: '',
    isActive: false,
    status: 'ready',
    terminal: options.terminal ?? 'term-1',
    launchAgent: options.agent,
    agentStatus: options.providerId
      ? { agentType: options.agent, providerSession: { key: 'session_id', id: options.providerId } }
      : options.agent
        ? { agentType: options.agent }
        : undefined
  }
}

function process(processName: string | null, foregroundProcess: string | null = processName) {
  return {
    process: {
      foregroundProcess,
      foregroundProcessEvidence: {
        verdict: 'live',
        processName,
        authorityGeneration: 'generation',
        observationEpoch: 1,
        capturedAgeMs: 0,
        ptyId: 'term-1',
        ptyIncarnationId: 'incarnation-1',
        fence: {
          platform: 'posix',
          shellPid: 1,
          shellStartTime: '1',
          tty: 'pts/1',
          foregroundPgid: 2,
          ...(processName ? { process: { pid: 2, startTime: '2' } } : {})
        }
      }
    }
  }
}

describe('paired Backlog provider ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('proves exited only from complete fresh and authoritative empty inventories', async () => {
    mocks.call.mockResolvedValueOnce(inventory()).mockResolvedValueOnce(listed())
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('exited')
  })

  it('finds the linked provider globally and verifies its host process', async () => {
    mocks.call
      .mockResolvedValueOnce(inventory([readyTab({ providerId: 'provider-1', agent: 'codex' })]))
      .mockResolvedValueOnce(listed([{ ...terminal(), worktreeId: 'other' }]))
      .mockResolvedValueOnce(process('codex'))
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('live')
  })

  it('fails closed for a matching agent whose provider identity is unknown', async () => {
    mocks.call
      .mockResolvedValueOnce(inventory([readyTab({ agent: 'codex' })]))
      .mockResolvedValueOnce(listed([terminal()]))
      .mockResolvedValueOnce(process('codex'))
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('unverifiable')
  })

  it('probes a saved handle even when the session tab has no agent hints', async () => {
    mocks.call
      .mockResolvedValueOnce(inventory([readyTab()]))
      .mockResolvedValueOnce(listed([terminal()]))
      .mockResolvedValueOnce(process('codex'))
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('unverifiable')
    expect(mocks.call).toHaveBeenLastCalledWith(
      { kind: 'environment', environmentId: 'owner' },
      'terminal.inspectProcess',
      { terminal: 'term-1', expectedIncarnationId: 'incarnation-1' },
      { timeoutMs: 15_000 }
    )
  })

  it('does not turn an unrecognized foreground process into exit evidence', async () => {
    mocks.call
      .mockResolvedValueOnce(inventory([readyTab()]))
      .mockResolvedValueOnce(listed([terminal()]))
      .mockResolvedValueOnce(process(null, 'node'))
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('unverifiable')
  })

  it('fails closed when the owner host scope is incomplete', async () => {
    mocks.call.mockResolvedValueOnce(inventory()).mockResolvedValueOnce({
      ...listed(),
      hostScope: { hostIds: ['local'], omittedHostIds: ['local'] }
    })
    await expect(
      classifyPairedProviderOwner({ environmentId: 'owner', association, agent: 'codex' })
    ).resolves.toBe('unverifiable')
  })
})
