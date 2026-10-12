import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { openMobileAgentHistorySession } from './open-mobile-agent-history-session'

function session(): AiVaultSession {
  return {
    id: 'codex:thread-1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'thread-1',
    title: 'History',
    cwd: '/repo',
    branch: 'main',
    model: null,
    filePath: '/home/ada/.codex/sessions/thread-1.jsonl',
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
    structuredSession: {
      sessionId: 'codex_structured_1',
      workspaceId: 'workspace-1'
    }
  }
}

function openArgs(client: RpcClient, current: AiVaultSession) {
  return {
    client,
    session: current,
    hostCapabilities: [
      STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
      STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY
    ],
    hostPlatform: 'darwin' as const,
    hostTerminalWindowsShell: null,
    activeWorktreeId: 'workspace-1',
    worktrees: [],
    terminalMutationRegistry: {
      claim: vi.fn(() => 'unused'),
      releaseOnSuccess: vi.fn()
    }
  }
}

describe('openMobileAgentHistorySession', () => {
  it('coalesces repeated taps onto one reveal and never creates a terminal', async () => {
    let reply: ((value: unknown) => void) | undefined
    const sendRequest = vi.fn(
      () =>
        new Promise((resolve) => {
          reply = resolve
        })
    )
    const client = { sendRequest } as unknown as RpcClient
    const args = openArgs(client, session())

    const first = openMobileAgentHistorySession(args)
    const second = openMobileAgentHistorySession(args)
    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.reveal',
      { sessionId: 'codex_structured_1' },
      { timeoutMs: 15_000, budgetSpansConnect: true }
    )

    reply?.({ ok: true, result: { ok: true } })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: 'opened', message: 'Chat opened.', worktreeId: 'workspace-1' },
      { kind: 'opened', message: 'Chat opened.', worktreeId: 'workspace-1' }
    ])
  })
})
