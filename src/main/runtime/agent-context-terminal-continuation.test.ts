import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentContextTransitionRequest } from '../../shared/agent-context-transition'
import type { OrcaRuntimeService } from './orca-runtime'

const continuationMocks = vi.hoisted(() => ({
  inspect: vi.fn()
}))

vi.mock('../codex/codex-continuation-source', () => ({
  inspectCodexContextSource: continuationMocks.inspect
}))

import { continueAgentContextTerminal } from './agent-context-terminal-continuation'

const PROVIDER_SESSION_ID = 'provider-current'
const USER_MESSAGE_COUNT = 3
const PANE = { tabId: 'tab-current', leafId: '11111111-1111-4111-8111-111111111111' }

function request(): AgentContextTransitionRequest {
  return {
    requestId: 'request-current',
    target: {
      workspaceId: 'workspace-current',
      providerSessionId: PROVIDER_SESSION_ID,
      sourceGeneration: 'generation-current',
      turnId: 'turn-current',
      userMessageCount: USER_MESSAGE_COUNT,
      terminalHandle: 'terminal-previous',
      paneKey: `${PANE.tabId}:${PANE.leafId}`
    },
    input: {
      mode: 'compact',
      reason: 'The topic is complete.',
      checkpoint: {
        goal: 'Finish the transition',
        completed: 'The first topic is complete.',
        decisions: [],
        constraints: [],
        changes: [],
        verification: [],
        openQuestions: [],
        nextStep: 'Run the focused verification.'
      },
      continuation: 'continue'
    },
    status: 'ready',
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z'
  }
}

function terminal(handle: string, pane = PANE) {
  return { handle, tabId: pane.tabId, leafId: pane.leafId }
}

function runtime(overrides: Record<string, unknown> = {}) {
  const value = {
    listTerminals: vi.fn(async () => ({ terminals: [terminal('terminal-current')] })),
    sendTerminalAgentPrompt: vi.fn(async (_handle, _prompt, options) => {
      await options.beforeWrite?.('pty-current')
    }),
    getAgentContextPaneSnapshot: vi.fn(() => ({
      providerSession: { id: PROVIDER_SESSION_ID },
      state: 'done',
      interrupted: false
    })),
    getConversationContinuationSettings: vi.fn(() => ({ agentContextAutonomy: 'compact' })),
    resolveConversationContinuationSource: vi.fn(async () => ({ source: 'current' })),
    ...overrides
  }
  return value as typeof value & OrcaRuntimeService
}

beforeEach(() => {
  continuationMocks.inspect.mockReset().mockResolvedValue({
    activityReliable: true,
    userMessageCount: USER_MESSAGE_COUNT
  })
})

describe('terminal agent context continuation', () => {
  it('sends the next step once to the current matching pane handle after its guards pass', async () => {
    const owner = runtime({
      listTerminals: vi.fn(async () => ({
        terminals: [
          terminal('terminal-previous', {
            tabId: 'tab-old',
            leafId: '22222222-2222-4222-8222-222222222222'
          }),
          terminal('terminal-new')
        ]
      }))
    })

    await expect(
      continueAgentContextTerminal(owner, request(), PROVIDER_SESSION_ID, USER_MESSAGE_COUNT)
    ).resolves.toBe('terminal-new')

    expect(owner.listTerminals).toHaveBeenCalledWith('id:workspace-current')
    expect(owner.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
    expect(owner.sendTerminalAgentPrompt).toHaveBeenCalledWith(
      'terminal-new',
      'Run the focused verification.',
      { beforeWrite: expect.any(Function) }
    )
    expect(owner.getAgentContextPaneSnapshot).toHaveBeenCalledWith(`${PANE.tabId}:${PANE.leafId}`)
    expect(owner.resolveConversationContinuationSource).toHaveBeenCalledWith({
      workspaceId: 'workspace-current',
      providerSessionId: PROVIDER_SESSION_ID
    })
    expect(continuationMocks.inspect).toHaveBeenCalledOnce()
  })

  it('does not send when the matching pane is unavailable', async () => {
    const owner = runtime({ listTerminals: vi.fn(async () => ({ terminals: [] })) })

    await expect(
      continueAgentContextTerminal(owner, request(), PROVIDER_SESSION_ID, USER_MESSAGE_COUNT)
    ).rejects.toThrow('agent_context_continuation_target_unavailable')
    expect(owner.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the provider session changed',
      {
        getAgentContextPaneSnapshot: vi.fn(() => ({
          providerSession: { id: 'provider-other' },
          state: 'done',
          interrupted: false
        }))
      },
      'agent_context_continuation_target_changed'
    ],
    [
      'the transition policy changed',
      { getConversationContinuationSettings: vi.fn(() => ({ agentContextAutonomy: 'off' })) },
      'agent_context_continuation_target_changed'
    ],
    ['a transcript user message was added', {}, 'agent_context_continuation_new_input']
  ])('rejects when %s', async (_reason, overrides, expectedError) => {
    if (_reason === 'a transcript user message was added') {
      continuationMocks.inspect.mockResolvedValueOnce({
        activityReliable: true,
        userMessageCount: USER_MESSAGE_COUNT + 1
      })
    }
    const owner = runtime(overrides)

    await expect(
      continueAgentContextTerminal(owner, request(), PROVIDER_SESSION_ID, USER_MESSAGE_COUNT)
    ).rejects.toThrow(expectedError)
    expect(owner.sendTerminalAgentPrompt).toHaveBeenCalledOnce()
  })
})
