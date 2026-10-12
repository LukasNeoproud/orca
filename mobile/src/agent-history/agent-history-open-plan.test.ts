import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import { resolveMobileAgentHistoryOpenPlan } from './agent-history-open-plan'

function historySession(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
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
    ...overrides
  }
}

describe('mobile Agent Session History open planning', () => {
  it('reveals the existing tab after restart when the host reports a structured owner', () => {
    expect(
      resolveMobileAgentHistoryOpenPlan(
        historySession({
          structuredSession: {
            sessionId: 'codex_structured_1',
            workspaceId: 'workspace-1'
          }
        }),
        [
          STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
          STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY
        ]
      )
    ).toEqual({ kind: 'reveal', sessionId: 'codex_structured_1', worktreeId: 'workspace-1' })
  })

  it('does not fall back to a terminal on a structured host too old for ownership-safe reveal', () => {
    expect(
      resolveMobileAgentHistoryOpenPlan(historySession(), [
        STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
      ])
    ).toMatchObject({ kind: 'blocked' })
  })

  it('adopts an exited provider conversation when structured history resume is negotiated', () => {
    expect(
      resolveMobileAgentHistoryOpenPlan(historySession(), [
        STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY
      ])
    ).toEqual({ kind: 'structured-resume', agent: 'codex' })
  })

  it('keeps terminal resume for providers without a structured lane on an ownership-safe host', () => {
    expect(
      resolveMobileAgentHistoryOpenPlan(historySession({ agent: 'gemini' }), [
        STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY
      ])
    ).toEqual({ kind: 'terminal-resume' })
  })
})
