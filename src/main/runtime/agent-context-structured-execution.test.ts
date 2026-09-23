import { describe, expect, it, vi } from 'vitest'

const hostRef = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => hostRef.current
}))

import { executeAgentContextStructured } from './agent-context-structured-execution'

const SOURCE_SESSION = 'session-source'
const SOURCE_THREAD = 'thread-source'
const CANDIDATE_THREAD = 'thread-candidate'
const REPLACEMENT_SESSION = 'session-replacement'

function request(continuation: 'wait-for-user' | 'continue' = 'wait-for-user') {
  return {
    requestId: 'request-1',
    target: {
      workspaceId: 'workspace-1',
      providerSessionId: SOURCE_THREAD,
      sourceGeneration: 'generation-1',
      turnId: 'turn-1',
      sessionId: SOURCE_SESSION
    },
    input: {
      mode: 'compact' as const,
      reason: 'Context is full.',
      checkpoint: {
        goal: 'Complete the task',
        completed: 'Prepared the change',
        decisions: [],
        constraints: [],
        changes: [],
        verification: [],
        openQuestions: [],
        ...(continuation === 'continue' ? { nextStep: 'Run the verification.' } : {})
      },
      continuation
    },
    status: 'ready' as const,
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z'
  }
}

function record(threadId: string) {
  return {
    provider: 'codex',
    location: { workspaceId: 'workspace-1' },
    providerHandleChain: [{ handle: { provider: 'codex', threadId } }],
    lease: { runtimeFence: 7 }
  }
}

function installHost() {
  const records = new Map([
    [SOURCE_SESSION, record(SOURCE_THREAD)],
    [REPLACEMENT_SESSION, record(CANDIDATE_THREAD)]
  ])
  const replacement = {
    sourceSessionId: SOURCE_SESSION,
    sessionId: REPLACEMENT_SESSION,
    workspaceId: 'workspace-1',
    agent: 'codex' as const
  }
  const host = {
    deps: { store: { getRecord: vi.fn((id: string) => records.get(id)) } },
    conversationCommand: vi.fn(async (_caller, params) => {
      await params.beforeRun?.()
      return { ok: true, value: { replacementSessionId: REPLACEMENT_SESSION } }
    }),
    conversationReplacements: vi.fn(() => [replacement]),
    close: vi.fn(async () => {}),
    journalSnapshot: vi.fn(() => ({ submissions: [] as { clientMessageId: string }[] })),
    send: vi.fn(async (_caller, params) => {
      const refusal = params.beforeDispatch?.()
      return refusal
        ? { ok: false, refusal }
        : { ok: true, value: { submission: { dispatchState: 'accepted' } } }
    })
  }
  hostRef.current = host
  return { host, replacement }
}

describe('executeAgentContextStructured', () => {
  it('claims the prepared candidate only inside the admitted clear command and replaces the tab', async () => {
    const { host, replacement } = installHost()
    const runtime = { replaceStructuredAgentSessionTab: vi.fn(async () => {}) }
    const guard = vi.fn(async () => true)
    const markEffectPossible = vi.fn()
    const claimCandidate = vi.fn()

    await expect(
      executeAgentContextStructured(
        runtime,
        request(),
        { providerSessionId: CANDIDATE_THREAD, transcriptPath: '/tmp/candidate.jsonl' },
        { guard, markEffectPossible, claimCandidate }
      )
    ).resolves.toEqual({
      newProviderSessionId: CANDIDATE_THREAD,
      newSessionId: REPLACEMENT_SESSION
    })

    expect(host.conversationCommand).toHaveBeenCalledWith(
      { callerKey: 'agent-context:request-1' },
      expect.objectContaining({
        command: 'clear',
        replacement: expect.objectContaining({ mode: 'compact' })
      })
    )
    expect(guard).toHaveBeenCalledOnce()
    expect(markEffectPossible).toHaveBeenCalledOnce()
    expect(claimCandidate).toHaveBeenCalledOnce()
    expect(runtime.replaceStructuredAgentSessionTab).toHaveBeenCalledWith(replacement)
    expect(host.close).toHaveBeenCalledWith(SOURCE_SESSION)
    expect(host.send).not.toHaveBeenCalled()
  })

  it('submits one durable next step only for continue', async () => {
    const { host } = installHost()
    const runtime = { replaceStructuredAgentSessionTab: vi.fn(async () => {}) }

    await executeAgentContextStructured(
      runtime,
      request('continue'),
      { providerSessionId: CANDIDATE_THREAD, transcriptPath: '/tmp/candidate.jsonl' },
      { guard: () => true, markEffectPossible: vi.fn() }
    )

    expect(host.send).toHaveBeenCalledWith(
      { callerKey: 'agent-context:request-1' },
      expect.objectContaining({
        body: {
          kind: 'message',
          role: 'user',
          blocks: [{ type: 'text', text: 'Run the verification.' }]
        }
      })
    )
  })

  it('does not mark or claim a source the guard invalidated', async () => {
    const { host } = installHost()
    const markEffectPossible = vi.fn()
    const claimCandidate = vi.fn()

    await expect(
      executeAgentContextStructured(
        { replaceStructuredAgentSessionTab: vi.fn(async () => {}) },
        request(),
        { providerSessionId: CANDIDATE_THREAD, transcriptPath: '/tmp/candidate.jsonl' },
        { guard: () => false, markEffectPossible, claimCandidate }
      )
    ).rejects.toThrow('agent_context_transition_source_stale')

    expect(markEffectPossible).not.toHaveBeenCalled()
    expect(claimCandidate).not.toHaveBeenCalled()
    expect(host.close).not.toHaveBeenCalled()
  })

  it('does not auto-continue over a message submitted to the replacement', async () => {
    const { host } = installHost()
    const runtime = {
      replaceStructuredAgentSessionTab: vi.fn(async () => {
        host.journalSnapshot.mockReturnValue({
          submissions: [{ clientMessageId: 'new-user-message' }]
        })
      })
    }
    await expect(
      executeAgentContextStructured(
        runtime,
        request('continue'),
        { providerSessionId: CANDIDATE_THREAD, transcriptPath: '/tmp/candidate.jsonl' },
        { guard: () => true, markEffectPossible: vi.fn() }
      )
    ).rejects.toThrow('agent_session_operation_invalid')
  })
})
