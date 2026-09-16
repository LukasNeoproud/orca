import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { classifyRememberedAiVaultStructuredOwner } from './ai-vault-session-structured-owner'

function session(overrides: Partial<AiVaultSession>): AiVaultSession {
  return {
    id: 'local:claude:provider-1',
    executionHostId: 'local',
    agent: 'claude',
    sessionId: 'provider-1',
    title: 'Session',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: '/history/provider-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-15T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'claude --resume provider-1',
    subagent: null,
    ...overrides
  }
}

describe('classifyRememberedAiVaultStructuredOwner', () => {
  it.each([
    session({ agent: 'claude' }),
    session({ agent: 'codex', codexHome: '/Users/alice/.codex' })
  ])(
    'asks the host for ownership even when normal preparation would short-circuit',
    async (row) => {
      const prepare = vi.fn().mockResolvedValue({ useRealCodexHome: false })

      await expect(classifyRememberedAiVaultStructuredOwner(row, prepare)).resolves.toBe('exited')
      expect(prepare).toHaveBeenCalledWith({
        agent: row.agent,
        sessionId: row.sessionId,
        filePath: row.filePath,
        codexHome: row.codexHome,
        executionHostId: row.executionHostId
      })
    }
  )

  it('preserves live and unverifiable lease verdicts', async () => {
    const row = session({})
    await expect(
      classifyRememberedAiVaultStructuredOwner(
        row,
        vi.fn().mockRejectedValue({ code: 'agent_session_conflict' })
      )
    ).resolves.toBe('live')
    await expect(
      classifyRememberedAiVaultStructuredOwner(
        row,
        vi.fn().mockRejectedValue({ code: 'agent_session_ownership_unknown' })
      )
    ).resolves.toBe('unverifiable')
  })
})
