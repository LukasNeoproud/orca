import { describe, expect, it, vi } from 'vitest'
import type { StructuredAgentSessionTerminalAdoptionResult } from '../../../shared/structured-agent-session-terminal-adoption'
import { structuredAgentSessionPayloadFingerprint } from '../../../shared/structured-agent-session-mutation'
const mocks = vi.hoisted(() => ({ call: vi.fn(), publish: vi.fn() }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))
vi.mock('@/runtime/structured-agent-session-handoff-store', () => ({
  publishStructuredHandoff: mocks.publish
}))
import {
  adoptStructuredAgentTerminal,
  returnAdoptedTerminalToStructuredChat
} from './adopt-structured-agent-terminal'

const input = {
  worktreeId: 'adoption-worktree',
  agent: 'codex' as const,
  providerSessionId: 'provider-thread',
  terminal: {
    tabId: 'terminal',
    paneKey: 'terminal:11111111-1111-4111-8111-111111111111',
    ptyId: 'pty-original'
  }
}
const adopted: StructuredAgentSessionTerminalAdoptionResult = {
  sessionId: 'codex_adopted',
  fence: 3,
  agent: 'codex'
}

describe('terminal adoption RPC intent', () => {
  it('deduplicates concurrent requests and retains the exact envelope after an unknown outcome', async () => {
    let reject!: (error: Error) => void
    mocks.call.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    const first = adoptStructuredAgentTerminal(input)
    const concurrent = adoptStructuredAgentTerminal(input)
    expect(concurrent).toBe(first)
    expect(mocks.call).toHaveBeenCalledTimes(1)
    const [target, method, params] = mocks.call.mock.calls[0]
    expect(target).toEqual({ kind: 'local' })
    expect(method).toBe('agentSession.adoptTerminal')
    const fields = {
      agent: 'codex',
      providerSessionId: 'provider-thread',
      terminal: input.terminal,
      worktree: 'id:adoption-worktree'
    }
    expect(params).toMatchObject({ ...fields, envelope: { expectedRuntimeFence: null } })
    expect(params.envelope.payloadFingerprint).toBe(
      structuredAgentSessionPayloadFingerprint({
        method,
        sessionId: params.envelope.sessionId,
        fields
      })
    )
    reject(new Error('Reply lost'))
    await expect(first).rejects.toThrow('Reply lost')
    mocks.call.mockResolvedValueOnce(adopted)
    await expect(adoptStructuredAgentTerminal(input)).resolves.toEqual(adopted)
    expect(mocks.call.mock.calls[1][2]).toEqual(params)
    mocks.call.mockResolvedValueOnce(adopted)
    await adoptStructuredAgentTerminal({
      ...input,
      terminal: { ...input.terminal, ptyId: 'pty-replacement' }
    })
    expect(mocks.call.mock.calls[2][2].envelope.sessionId).not.toBe(params.envelope.sessionId)
  })

  it('requests the native handoff against the adopted fence and publishes its returned owner', async () => {
    mocks.call.mockClear()
    const status = {
      owner: 'tui',
      direction: 'to-native',
      phase: 'queued',
      stage: null,
      operationId: 'handoff'
    }
    mocks.call.mockResolvedValueOnce({ ok: true, fence: 4, value: { status } })
    await returnAdoptedTerminalToStructuredChat(adopted)
    const fields = { direction: 'to-native', mode: 'after-turn', action: 'start' }
    expect(mocks.call).toHaveBeenCalledWith({ kind: 'local' }, 'agentSession.requestHandoff', {
      ...fields,
      envelope: expect.objectContaining({
        sessionId: adopted.sessionId,
        expectedRuntimeFence: adopted.fence,
        payloadFingerprint: structuredAgentSessionPayloadFingerprint({
          method: 'agentSession.requestHandoff',
          sessionId: adopted.sessionId,
          fields
        })
      })
    })
    expect(mocks.publish).toHaveBeenCalledWith({ sessionId: adopted.sessionId, fence: 4, status })
    mocks.call.mockResolvedValueOnce({ ok: false, refusal: { message: 'Owner unverifiable' } })
    await expect(returnAdoptedTerminalToStructuredChat(adopted)).rejects.toThrow(
      'Owner unverifiable'
    )
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh intent after a confirmed adoption in the same terminal without a session hint', async () => {
    mocks.call.mockClear()
    const { providerSessionId: _providerSessionId, ...withoutSessionHint } = input
    mocks.call.mockResolvedValue(adopted)
    await adoptStructuredAgentTerminal(withoutSessionHint)
    await adoptStructuredAgentTerminal(withoutSessionHint)
    const [first, second] = mocks.call.mock.calls.map((call) => call[2])
    expect(first).not.toHaveProperty('providerSessionId')
    expect(second.envelope.sessionId).not.toBe(first.envelope.sessionId)
    expect(second.envelope.clientOperationId).not.toBe(first.envelope.clientOperationId)
  })
})
