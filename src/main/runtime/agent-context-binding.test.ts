import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../shared/stable-pane-id'
import type { OrcaRuntimeService } from './orca-runtime'

const bindingHost = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => bindingHost.current
}))

import { agentContextBindingIsCurrent, resolveAgentContextBinding } from './agent-context-binding'

function structuredRecord(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'codex',
    location: { workspaceId: 'workspace-1', executionHostId: 'local', wslDistro: null },
    providerHandleChain: [{ handle: { provider: 'codex', threadId: 'thread-1' } }],
    lease: {
      runtimeKind: 'native',
      claimStatus: 'live',
      unreconciled: false,
      runtimeFence: 7,
      ownerProcess: { spawnToken: 'identity-token' }
    },
    ...overrides
  }
}

function terminalRuntime() {
  const terminal = {
    connected: true,
    ptyId: 10,
    incarnationId: 'incarnation-1',
    worktreeId: 'workspace-1',
    tabId: 'tab-1',
    leafId: '019fd532-7c11-4a90-b6de-4e1a2c3d5f60'
  }
  const paneKey = makePaneKey(terminal.tabId, terminal.leafId)
  const runtime = {
    showTerminal: vi.fn(async () => terminal),
    getAgentContextPaneSnapshot: vi.fn(() => ({
      agentType: 'codex',
      providerSession: { id: 'thread-1' }
    })),
    resolveConversationContinuationSource: vi.fn(async () => ({}))
  }
  return {
    paneKey,
    terminal,
    runtime: runtime as typeof runtime & OrcaRuntimeService
  }
}

beforeEach(() => {
  bindingHost.current = null
})

describe('agent context binding', () => {
  it('requires the exact structured owner token and local supported provider', async () => {
    const record = structuredRecord()
    bindingHost.current = { deps: { store: { getRecord: vi.fn(() => record) } } }
    const runtime = {} as OrcaRuntimeService

    await expect(
      resolveAgentContextBinding(runtime, { sessionId: 'session-1', spawnToken: 'identity-token' })
    ).resolves.toEqual({
      workspaceId: 'workspace-1',
      providerSessionId: 'thread-1',
      sourceGeneration: 'native:7',
      sessionId: 'session-1'
    })
    await expect(
      resolveAgentContextBinding(runtime, { sessionId: 'session-1', spawnToken: 'wrong-token' })
    ).rejects.toThrow('agent_context_caller_unverified')

    record.location.executionHostId = 'ssh-host'
    await expect(
      resolveAgentContextBinding(runtime, { sessionId: 'session-1', spawnToken: 'identity-token' })
    ).rejects.toThrow('agent_context_host_unsupported')
  })

  it('binds a terminal caller to its exact pane and source generation', async () => {
    const { runtime, terminal, paneKey } = terminalRuntime()

    await expect(
      resolveAgentContextBinding(runtime, { terminalHandle: 'terminal-1', paneKey })
    ).resolves.toEqual({
      workspaceId: 'workspace-1',
      providerSessionId: 'thread-1',
      sourceGeneration: 'incarnation-1',
      terminalHandle: 'terminal-1',
      paneKey
    })
    expect(runtime.resolveConversationContinuationSource).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      providerSessionId: 'thread-1'
    })

    terminal.incarnationId = 'replacement-incarnation'
    await expect(
      agentContextBindingIsCurrent(runtime, {
        workspaceId: 'workspace-1',
        providerSessionId: 'thread-1',
        sourceGeneration: 'incarnation-1',
        terminalHandle: 'terminal-1',
        paneKey
      })
    ).resolves.toBe(false)
  })

  it('rejects mismatched panes and unsupported terminal providers before admission', async () => {
    const { runtime, paneKey } = terminalRuntime()
    await expect(
      resolveAgentContextBinding(runtime, {
        terminalHandle: 'terminal-1',
        paneKey: `${paneKey}-other`
      })
    ).rejects.toThrow('agent_context_caller_unverified')

    runtime.getAgentContextPaneSnapshot.mockReturnValue({
      agentType: 'claude',
      providerSession: { id: 'thread-1' }
    })
    await expect(
      resolveAgentContextBinding(runtime, { terminalHandle: 'terminal-1', paneKey })
    ).rejects.toThrow('agent_context_provider_unsupported')
  })
})
