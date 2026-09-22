import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  assertCapability: vi.fn(),
  refresh: vi.fn(),
  capabilities: ['conversation.continuation.v1'] as string[]
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mock.call,
  assertRuntimeEnvironmentCapability: mock.assertCapability
}))
vi.mock('@/runtime/local-runtime-capabilities', () => ({
  readLocalRuntimeCapabilitiesOrUnknown: () => mock.capabilities,
  refreshLocalRuntimeCapabilities: mock.refresh
}))

import {
  claimContinuationCandidate,
  inspectContinuation,
  prepareContinuation
} from './conversation-continuation-client'

const source = { providerSessionId: 'provider-session', workspaceId: 'folder:project' }

describe('conversation continuation client routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.capabilities = ['conversation.continuation.v1']
    mock.assertCapability.mockResolvedValue(undefined)
    mock.call.mockResolvedValue({})
  })

  it('refuses an older paired owner without falling back to the local runtime', async () => {
    mock.assertCapability.mockRejectedValue(
      new Error('Update the owning Orca runtime to use conversation continuation.')
    )
    const target = { kind: 'environment' as const, environmentId: 'owning-peer' }

    await expect(inspectContinuation(target, source)).rejects.toThrow('Update the owning')
    expect(mock.assertCapability).toHaveBeenCalledExactlyOnceWith(
      'owning-peer',
      'conversation.continuation.v1',
      'Update the owning Orca runtime to use conversation continuation.',
      15_000
    )
    expect(mock.call).not.toHaveBeenCalled()
    expect(mock.refresh).not.toHaveBeenCalled()
  })

  it('keeps preparation pinned to the capability-proven paired runtime', async () => {
    const target = { kind: 'environment' as const, environmentId: 'owning-peer' }

    await prepareContinuation(target, source, 'revision-1')

    expect(mock.call).toHaveBeenCalledExactlyOnceWith(
      target,
      'conversationContinuation.prepare',
      { source, expectedRevision: 'revision-1' },
      { timeoutMs: 120_000 }
    )
  })

  it('propagates a failed claim without inspecting, preparing, or switching targets', async () => {
    const target = { kind: 'environment' as const, environmentId: 'owning-peer' }
    mock.call.mockRejectedValue(new Error('conversation_continuation_candidate_already_claimed'))

    await expect(claimContinuationCandidate(target, 'candidate-1')).rejects.toThrow(
      'conversation_continuation_candidate_already_claimed'
    )
    expect(mock.call).toHaveBeenCalledExactlyOnceWith(
      target,
      'conversationContinuation.claim',
      { candidateId: 'candidate-1' },
      { timeoutMs: 120_000 }
    )
  })
})
