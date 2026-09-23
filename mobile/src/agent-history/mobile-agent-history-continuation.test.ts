import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  CONVERSATION_CONTINUATION_CAPABILITY,
  type ConversationContinuationView
} from '../../../src/shared/conversation-continuation-view'
import {
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { readMobileStructuredLaunchDraft } from '../session/mobile-structured-launch-drafts'
import {
  canOfferMobileAgentHistoryContinuation,
  isSupportedMobileContinuationTarget,
  launchMobileConversationContinuation,
  MobileContinuationCancelledError
} from './mobile-agent-history-continuation'

const SOURCE = { providerSessionId: 'source-thread', workspaceId: 'workspace-1' }
const CHECKPOINT = {
  lastTurnId: 'turn-1',
  completedAt: '2026-09-23T00:00:00.000Z',
  revision: 'revision-1'
}
const CANDIDATE = {
  candidateId: 'candidate-1',
  source: SOURCE,
  checkpoint: CHECKPOINT,
  status: 'ready' as const,
  providerSessionId: 'prepared-thread',
  transcriptPath: '/trusted/prepared.jsonl',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z'
}

function view(
  candidate: ConversationContinuationView['candidate'] = null
): ConversationContinuationView {
  return { source: SOURCE, checkpoint: CHECKPOINT, candidate, autoCompact: false }
}

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'codex:source-thread',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'source-thread',
    title: 'History',
    cwd: '/repo',
    branch: 'main',
    model: null,
    filePath: '/home/ada/.codex/sessions/source-thread.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-23T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 1,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: '',
    subagent: null,
    ...overrides
  }
}

const CAPABILITIES = [
  CONVERSATION_CONTINUATION_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY
]

function client(sendRequest: ReturnType<typeof vi.fn>): RpcClient {
  return { sendRequest } as unknown as RpcClient
}

describe('mobile Agent Session History continuation', () => {
  it('offers choices only for local, ownership-safe Codex rows on a current host', () => {
    expect(canOfferMobileAgentHistoryContinuation(session(), CAPABILITIES)).toBe(true)
    expect(canOfferMobileAgentHistoryContinuation(session({ agent: 'claude' }), CAPABILITIES)).toBe(
      false
    )
    expect(
      canOfferMobileAgentHistoryContinuation(
        session({ executionHostId: 'ssh:server-1' }),
        CAPABILITIES
      )
    ).toBe(false)
    expect(canOfferMobileAgentHistoryContinuation(session(), CAPABILITIES.slice(1))).toBe(false)
    expect(
      canOfferMobileAgentHistoryContinuation(
        session({
          structuredSession: {
            sessionId: 'codex_structured_1',
            workspaceId: 'workspace-1',
            ownerState: 'unverifiable'
          }
        }),
        CAPABILITIES
      )
    ).toBe(false)
  })

  it('rejects SSH and Windows-hosted WSL targets before continuation RPCs are offered', () => {
    expect(
      isSupportedMobileContinuationTarget(
        { status: 'blocked', message: 'SSH is unavailable.' },
        'linux'
      )
    ).toBe(false)
    expect(
      isSupportedMobileContinuationTarget(
        {
          status: 'ready',
          worktreeId: 'wsl-workspace',
          targetStatus: 'local',
          workspacePath: '\\\\wsl.localhost\\Ubuntu\\home\\ada\\repo',
          terminalPlatform: 'linux'
        },
        'win32'
      )
    ).toBe(false)
    expect(
      isSupportedMobileContinuationTarget(
        {
          status: 'ready',
          worktreeId: 'local-workspace',
          targetStatus: 'local',
          workspacePath: 'C:\\repo',
          terminalPlatform: 'win32'
        },
        'win32'
      )
    ).toBe(true)
  })

  it('stops after preparation when the sheet is cancelled', async () => {
    let resolvePrepare: ((value: unknown) => void) | undefined
    let current = true
    const sendRequest = vi.fn((method: string) => {
      if (method === 'conversationContinuation.inspect') {
        return Promise.resolve({ ok: true, result: view() })
      }
      if (method === 'conversationContinuation.prepare') {
        return new Promise((resolve) => {
          resolvePrepare = resolve
        })
      }
      throw new Error(`unexpected ${method}`)
    })
    const launch = launchMobileConversationContinuation({
      client: client(sendRequest),
      hostId: 'host-a',
      worktreeId: 'workspace-1',
      source: SOURCE,
      mode: 'compacted',
      isCurrent: () => current
    })
    await vi.waitFor(() => expect(resolvePrepare).toBeTypeOf('function'))
    current = false
    resolvePrepare?.({ ok: true, result: CANDIDATE })

    await expect(launch).rejects.toBeInstanceOf(MobileContinuationCancelledError)
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'conversationContinuation.inspect',
      'conversationContinuation.prepare'
    ])
  })

  it('claims and adopts the exact prepared provider session', async () => {
    const sendRequest = vi.fn(async (method: string, params: unknown) => {
      if (method === 'conversationContinuation.inspect') {
        return { ok: true, result: view(CANDIDATE) }
      }
      if (method === 'conversationContinuation.claim') {
        return { ok: true, result: { ...CANDIDATE, status: 'used' } }
      }
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      if (method === 'agentSession.create') {
        const create = params as { envelope: { sessionId: string } }
        return {
          ok: true,
          result: { ok: true, value: { sessionId: create.envelope.sessionId } }
        }
      }
      throw new Error(`unexpected ${method}`)
    })

    await expect(
      launchMobileConversationContinuation({
        client: client(sendRequest),
        hostId: 'host-a',
        worktreeId: 'workspace-1',
        source: SOURCE,
        mode: 'compacted',
        isCurrent: () => true
      })
    ).resolves.toMatchObject({ kind: 'opened' })
    expect(sendRequest).toHaveBeenCalledWith(
      'conversationContinuation.claim',
      { candidateId: 'candidate-1' },
      expect.objectContaining({ failWhenDisconnected: true })
    )
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.create',
      expect.objectContaining({ resumeFrom: { providerSessionId: 'prepared-thread' } }),
      expect.anything()
    )
  })

  it('does not replay or create after reconnect interrupts preparation', async () => {
    const sendRequest = vi.fn(async (method: string, _params: unknown, options: unknown) => {
      if (method === 'conversationContinuation.inspect') {
        return { ok: true, result: view() }
      }
      if (method === 'conversationContinuation.prepare') {
        expect(options).toMatchObject({ failWhenDisconnected: true })
        throw new Error('Connection interrupted')
      }
      throw new Error(`unexpected ${method}`)
    })

    await expect(
      launchMobileConversationContinuation({
        client: client(sendRequest),
        hostId: 'host-a',
        worktreeId: 'workspace-1',
        source: SOURCE,
        mode: 'compacted',
        isCurrent: () => true
      })
    ).rejects.toThrow('Connection interrupted')
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'conversationContinuation.inspect',
      'conversationContinuation.prepare'
    ])
  })

  it('lets only one concurrent opener claim and create the prepared copy', async () => {
    let claimed = false
    const sendRequest = vi.fn(async (method: string, params: unknown) => {
      if (method === 'conversationContinuation.inspect') {
        return { ok: true, result: view(CANDIDATE) }
      }
      if (method === 'conversationContinuation.claim') {
        if (claimed) {
          return {
            ok: false,
            error: { message: 'conversation_continuation_candidate_already_claimed' }
          }
        }
        claimed = true
        return { ok: true, result: { ...CANDIDATE, status: 'used' } }
      }
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      if (method === 'agentSession.create') {
        const create = params as { envelope: { sessionId: string } }
        return {
          ok: true,
          result: { ok: true, value: { sessionId: create.envelope.sessionId } }
        }
      }
      throw new Error(`unexpected ${method}`)
    })
    const args = {
      client: client(sendRequest),
      hostId: 'host-a',
      worktreeId: 'workspace-1',
      source: SOURCE,
      mode: 'compacted' as const,
      isCurrent: () => true
    }

    const results = await Promise.allSettled([
      launchMobileConversationContinuation(args),
      launchMobileConversationContinuation(args)
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(
      sendRequest.mock.calls.filter(([method]) => method === 'agentSession.create')
    ).toHaveLength(1)
  })

  it('retains reference draft context when structured create acknowledgement stays unknown', async () => {
    let intendedSessionId = ''
    const sendRequest = vi.fn(async (method: string, params: unknown) => {
      if (method === 'conversationContinuation.inspect') {
        return { ok: true, result: view() }
      }
      if (method === 'conversationContinuation.reference') {
        return { ok: true, result: { reference: 'Reference: /context/source-thread.md' } }
      }
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      if (method === 'agentSession.create') {
        intendedSessionId = (params as { envelope: { sessionId: string } }).envelope.sessionId
        throw new Error('Connection interrupted')
      }
      throw new Error(`unexpected ${method}`)
    })

    await expect(
      launchMobileConversationContinuation({
        client: client(sendRequest),
        hostId: 'host-a',
        worktreeId: 'workspace-1',
        source: SOURCE,
        mode: 'reference',
        isCurrent: () => true
      })
    ).resolves.toMatchObject({ kind: 'blocked' })
    expect(readMobileStructuredLaunchDraft('host-a', intendedSessionId)?.text).toBe(
      'Reference: /context/source-thread.md'
    )
    expect(
      sendRequest.mock.calls.filter(([method]) => method === 'agentSession.create')
    ).toHaveLength(2)
  })

  it('does not turn a malformed reference response into a clean conversation', async () => {
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'conversationContinuation.inspect') {
        return { ok: true, result: view() }
      }
      if (method === 'conversationContinuation.reference') {
        return { ok: true, result: { reference: '' } }
      }
      throw new Error(`unexpected ${method}`)
    })

    await expect(
      launchMobileConversationContinuation({
        client: client(sendRequest),
        hostId: 'host-a',
        worktreeId: 'workspace-1',
        source: SOURCE,
        mode: 'reference',
        isCurrent: () => true
      })
    ).resolves.toEqual({
      kind: 'blocked',
      message: 'The conversation reference could not be prepared.'
    })
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'conversationContinuation.inspect',
      'conversationContinuation.reference'
    ])
  })
})
