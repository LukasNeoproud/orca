import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'

const rpcMocks = vi.hoisted(() => ({
  facade: vi.fn(),
  binding: vi.fn(),
  target: vi.fn(),
  structuredScope: vi.fn()
}))
vi.mock('../../conversation-continuation-runtime', () => ({
  conversationContinuationRuntime: rpcMocks.facade
}))
vi.mock('../../agent-context-binding', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, resolveAgentContextBinding: rpcMocks.binding }
})
vi.mock('../../agent-context-boundary', () => ({ captureAgentContextTarget: rpcMocks.target }))
vi.mock('./agent-context-structured-scope', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  structuredAgentContextScope: rpcMocks.structuredScope
}))

import { AGENT_CONTEXT_METHODS } from './agent-context'

const caller = { sessionId: 'session-1', spawnToken: 'token-1' }
const binding = {
  workspaceId: 'workspace-1',
  providerSessionId: 'provider-1',
  sourceGeneration: 'native:1',
  sessionId: 'session-1'
}
const input = {
  mode: 'compact' as const,
  reason: 'A coherent topic is complete.',
  checkpoint: {
    goal: 'Finish the feature',
    completed: 'Completed the engine',
    decisions: [],
    constraints: [],
    changes: [],
    verification: [],
    openQuestions: []
  },
  continuation: 'wait-for-user' as const
}
const queued = {
  requestId: 'operation-1',
  target: { ...binding, turnId: 'turn-1' },
  input,
  status: 'queued' as const,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
}

function request(method: string, params: unknown): RpcRequest {
  return { id: `rpc-${method}`, authToken: 'token', method, params }
}

function runtime(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'runtime-1',
    resolveConversationContinuationSource: vi.fn(async () => ({})),
    getConversationContinuationSettings: vi.fn(() => ({ agentContextAutonomy: 'off' }))
  } as unknown as OrcaRuntimeService
}

function facade() {
  return {
    transitions: {
      status: vi.fn((_source: unknown, _requestId: string): unknown => null),
      accept: vi.fn(async () => queued),
      cancel: vi.fn(),
      list: vi.fn((_source: unknown): unknown[] => []),
      listConversation: vi.fn((_source: unknown): unknown[] => []),
      cancelConversation: vi.fn(async (): Promise<unknown> => null)
    },
    surface: {
      cancel: vi.fn(),
      surface: vi.fn(),
      claimSurface: vi.fn(),
      completeSurface: vi.fn()
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rpcMocks.binding.mockResolvedValue(binding)
  rpcMocks.target.mockResolvedValue(queued.target)
  rpcMocks.structuredScope.mockReturnValue({
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    providerSessionId: 'provider-1',
    ownerState: 'live'
  })
})

describe('agent context RPC methods', () => {
  it('acknowledges a durable queued request without waiting for transition execution', async () => {
    const entry = facade()
    rpcMocks.facade.mockReturnValue(entry)
    const response = await new RpcDispatcher({
      runtime: runtime(),
      methods: AGENT_CONTEXT_METHODS
    }).dispatch(request('agentContext.request', { caller, requestId: 'operation-1', input }))

    expect(response).toMatchObject({
      ok: true,
      result: { requestId: 'operation-1', status: 'queued', endTurn: true }
    })
    expect(entry.transitions.accept).toHaveBeenCalledExactlyOnceWith(
      queued.target,
      input,
      'operation-1'
    )
  })

  it('replays the existing result after the requesting turn has ended', async () => {
    const entry = facade()
    entry.transitions.status.mockReturnValue({
      ...queued,
      status: 'completed',
      result: { newProviderSessionId: 'provider-2' }
    })
    rpcMocks.facade.mockReturnValue(entry)
    const response = await new RpcDispatcher({
      runtime: runtime(),
      methods: AGENT_CONTEXT_METHODS
    }).dispatch(request('agentContext.request', { caller, requestId: 'operation-1', input }))

    expect(response).toMatchObject({
      ok: true,
      result: { requestId: 'operation-1', status: 'completed', endTurn: false }
    })
    expect(rpcMocks.target).not.toHaveBeenCalled()
    expect(entry.transitions.accept).not.toHaveBeenCalled()
    expect(entry.transitions.status).toHaveBeenCalledWith(
      { workspaceId: 'workspace-1', providerSessionId: 'provider-1', sourceGeneration: 'native:1' },
      'operation-1'
    )
  })

  it('exposes conversation-scoped UI history and cancellation', async () => {
    const owner = runtime()
    const entry = facade()
    entry.transitions.listConversation.mockReturnValue([queued])
    entry.transitions.cancelConversation.mockResolvedValue({ ...queued, status: 'cancelled' })
    rpcMocks.facade.mockReturnValue(entry)
    const dispatcher = new RpcDispatcher({ runtime: owner, methods: AGENT_CONTEXT_METHODS })
    const source = { workspaceId: 'workspace-1', providerSessionId: 'provider-1' }

    await expect(
      dispatcher.dispatch(request('agentContext.inspect', { source }))
    ).resolves.toMatchObject({ ok: true, result: [{ requestId: 'operation-1' }] })
    await expect(
      dispatcher.dispatch(
        request('agentContext.cancelPending', { source, requestId: 'operation-1' })
      )
    ).resolves.toMatchObject({ ok: true, result: { status: 'cancelled' } })
    expect(owner.resolveConversationContinuationSource).toHaveBeenCalledTimes(2)
    expect(entry.transitions.cancelConversation).toHaveBeenCalledWith(source, 'operation-1')
    expect(entry.surface.cancel).toHaveBeenCalledWith('operation-1')
  })

  it('reports off policy and rejects capability-missing remote callers', async () => {
    const entry = facade()
    rpcMocks.facade.mockReturnValue(entry)
    const dispatcher = new RpcDispatcher({ runtime: runtime(), methods: AGENT_CONTEXT_METHODS })

    await expect(
      dispatcher.dispatch(request('agentContext.state', { caller }))
    ).resolves.toMatchObject({ ok: true, result: { provider: 'codex', policy: 'off' } })
    await expect(
      dispatcher.dispatch(request('agentContext.state', { caller }), {
        clientKind: 'runtime',
        clientCapabilities: []
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'runtime_error', message: 'agent_context_unsupported' }
    })
  })

  it('keeps structured inspection and cancellation scoped to the exact session', async () => {
    const entry = facade()
    entry.transitions.listConversation.mockReturnValue([
      queued,
      {
        ...queued,
        requestId: 'terminal-1',
        target: { ...queued.target, sessionId: undefined, terminalHandle: 'pty-1' }
      },
      { ...queued, requestId: 'other-1', target: { ...queued.target, sessionId: 'session-2' } }
    ])
    rpcMocks.facade.mockReturnValue(entry)
    const dispatcher = new RpcDispatcher({ runtime: runtime(), methods: AGENT_CONTEXT_METHODS })
    const remote = {
      clientKind: 'mobile' as const,
      clientCapabilities: ['agent.context-structured-mobile.v1']
    }

    await expect(
      dispatcher.dispatch(
        request('agentContext.inspectStructured', {
          sessionId: 'session-1'
        }),
        remote
      )
    ).resolves.toMatchObject({
      ok: true,
      result: {
        sessionId: 'session-1',
        ownerState: 'live',
        requests: [{ requestId: 'operation-1' }]
      }
    })
    await expect(
      dispatcher.dispatch(
        request('agentContext.cancelStructuredPending', {
          sessionId: 'session-1',
          requestId: 'terminal-1'
        }),
        remote
      )
    ).resolves.toMatchObject({ ok: false })
    expect(entry.transitions.cancelConversation).not.toHaveBeenCalled()
    await expect(
      dispatcher.dispatch(
        request('agentContext.cancelStructuredPending', {
          sessionId: 'session-1',
          requestId: 'operation-1'
        }),
        remote
      )
    ).resolves.toMatchObject({ ok: true })
    expect(entry.transitions.cancelConversation).toHaveBeenCalledWith(
      { workspaceId: 'workspace-1', providerSessionId: 'provider-1' },
      'operation-1'
    )
  })

  it('rejects structured inspection without its distinct mobile capability', async () => {
    rpcMocks.facade.mockReturnValue(facade())
    const dispatcher = new RpcDispatcher({ runtime: runtime(), methods: AGENT_CONTEXT_METHODS })
    await expect(
      dispatcher.dispatch(
        request('agentContext.inspectStructured', {
          sessionId: 'session-1'
        }),
        { clientKind: 'mobile', clientCapabilities: ['agent.context-transitions.v1'] }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { message: 'agent_context_structured_mobile_unsupported' }
    })
    expect(rpcMocks.structuredScope).not.toHaveBeenCalled()
  })
})
