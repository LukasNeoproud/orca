import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'

const runtimeFacade = vi.hoisted(() => ({
  resolve: vi.fn()
}))

vi.mock('../../conversation-continuation-runtime', () => ({
  conversationContinuationRuntime: runtimeFacade.resolve
}))

import { CONVERSATION_CONTINUATION_METHODS } from './conversation-continuation'

function runtime(id: string): OrcaRuntimeService {
  return { getRuntimeId: () => id } as unknown as OrcaRuntimeService
}

function request(method: string, params: unknown): RpcRequest {
  return { id: `request-${method}`, authToken: 'test-token', method, params }
}

function facade(viewId: string) {
  return {
    scheduler: {
      inspect: vi.fn().mockResolvedValue({
        source: { providerSessionId: viewId, workspaceId: `workspace-${viewId}` },
        checkpoint: null,
        candidate: null,
        autoCompact: false
      }),
      prepare: vi.fn()
    },
    service: {
      prepareReference: vi.fn(),
      prepareCandidateReference: vi.fn(),
      claim: vi.fn()
    }
  }
}

describe('conversation continuation RPC methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { source: { workspaceId: 'workspace' } },
    {
      source: { providerSessionId: 'session', workspaceId: 'workspace', transcriptPath: '/tmp/x' }
    },
    { source: { providerSessionId: 's'.repeat(513), workspaceId: 'workspace' } }
  ])('rejects untrusted source identity fields before runtime resolution: %j', async (params) => {
    const dispatcher = new RpcDispatcher({
      runtime: runtime('runtime-a'),
      methods: CONVERSATION_CONTINUATION_METHODS
    })

    await expect(
      dispatcher.dispatch(request('conversationContinuation.inspect', params))
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' },
      _meta: { runtimeId: 'runtime-a' }
    })
    expect(runtimeFacade.resolve).not.toHaveBeenCalled()
  })

  it('routes identical provider ids only through the dispatcher owning runtime', async () => {
    const runtimeA = runtime('runtime-a')
    const runtimeB = runtime('runtime-b')
    const facadeA = facade('source-a')
    const facadeB = facade('source-b')
    runtimeFacade.resolve.mockImplementation((owner) => {
      if (owner === runtimeA) {
        return facadeA
      }
      if (owner === runtimeB) {
        return facadeB
      }
      throw new Error('unexpected runtime')
    })
    const source = { providerSessionId: 'same-provider-id', workspaceId: 'same-workspace-id' }

    const responseA = await new RpcDispatcher({
      runtime: runtimeA,
      methods: CONVERSATION_CONTINUATION_METHODS
    }).dispatch(request('conversationContinuation.inspect', { source }))
    const responseB = await new RpcDispatcher({
      runtime: runtimeB,
      methods: CONVERSATION_CONTINUATION_METHODS
    }).dispatch(request('conversationContinuation.inspect', { source }))

    expect(responseA).toMatchObject({
      ok: true,
      result: { source: { providerSessionId: 'source-a' } }
    })
    expect(responseB).toMatchObject({
      ok: true,
      result: { source: { providerSessionId: 'source-b' } }
    })
    expect(facadeA.scheduler.inspect).toHaveBeenCalledExactlyOnceWith(source)
    expect(facadeB.scheduler.inspect).toHaveBeenCalledExactlyOnceWith(source)
  })

  it('does not create a reference after the source revision changes', async () => {
    const owner = runtime('runtime-a')
    const entry = facade('source-a')
    entry.scheduler.inspect.mockResolvedValue({
      source: { providerSessionId: 'source', workspaceId: 'workspace' },
      checkpoint: { lastTurnId: 'turn', completedAt: '2026-09-22T10:00:00.000Z', revision: 'new' },
      candidate: null,
      autoCompact: false
    })
    runtimeFacade.resolve.mockReturnValue(entry)
    const response = await new RpcDispatcher({
      runtime: owner,
      methods: CONVERSATION_CONTINUATION_METHODS
    }).dispatch(
      request('conversationContinuation.reference', {
        source: { providerSessionId: 'source', workspaceId: 'workspace' },
        expectedRevision: 'old'
      })
    )

    expect(response).toMatchObject({
      ok: false,
      error: { message: 'The conversation changed. Refresh before continuing.' }
    })
    expect(entry.service.prepareReference).not.toHaveBeenCalled()
  })

  it('surfaces a failed one-time claim without trying another runtime or preparation path', async () => {
    const owner = runtime('runtime-a')
    const entry = facade('source-a')
    const otherEntry = facade('source-b')
    entry.service.claim.mockRejectedValue(
      new Error('conversation_continuation_candidate_not_ready')
    )
    runtimeFacade.resolve.mockImplementation((selected) =>
      selected === owner ? entry : otherEntry
    )

    const response = await new RpcDispatcher({
      runtime: owner,
      methods: CONVERSATION_CONTINUATION_METHODS
    }).dispatch(request('conversationContinuation.claim', { candidateId: 'candidate-1' }))

    expect(response).toMatchObject({
      ok: false,
      error: {
        code: 'runtime_error',
        message: 'conversation_continuation_candidate_not_ready'
      },
      _meta: { runtimeId: 'runtime-a' }
    })
    expect(entry.service.claim).toHaveBeenCalledExactlyOnceWith('candidate-1')
    expect(entry.scheduler.prepare).not.toHaveBeenCalled()
    expect(otherEntry.service.claim).not.toHaveBeenCalled()
    expect(runtimeFacade.resolve).toHaveBeenCalledTimes(1)
    expect(runtimeFacade.resolve).toHaveBeenCalledWith(owner)
  })

  it('routes candidate references only to the owning runtime', async () => {
    const owner = runtime('runtime-a')
    const entry = facade('source-a')
    entry.service.prepareCandidateReference.mockResolvedValue({ reference: 'snapshot' })
    runtimeFacade.resolve.mockReturnValue(entry)
    const params = {
      source: { providerSessionId: 'session', workspaceId: 'workspace' },
      expectedRevision: 'revision',
      candidateId: 'candidate'
    }
    const response = await new RpcDispatcher({
      runtime: owner,
      methods: CONVERSATION_CONTINUATION_METHODS
    }).dispatch(request('conversationContinuation.candidateReference', params))
    expect(response).toMatchObject({ ok: true, result: { reference: 'snapshot' } })
    expect(entry.service.prepareCandidateReference).toHaveBeenCalledExactlyOnceWith(params)
  })
})
