import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { portableConversationHistoryWorkspaceId } from './portable-conversation-history-entry'

const session = {
  id: 'session',
  executionHostId: 'ssh:builder',
  agent: 'codex',
  sessionId: 'thread',
  title: 'Remote history',
  cwd: '/workspace',
  branch: null,
  model: null,
  filePath: '/remote/.codex/thread.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-09-22T12:00:00.000Z',
  messageCount: 1,
  totalTokens: 0,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: '',
  subagent: null
} as AiVaultSession

const worktreeInfo = {
  status: 'active' as const,
  label: 'Remote workspace',
  path: '/workspace',
  worktreeId: 'remote-worktree'
}

describe('portableConversationHistoryWorkspaceId', () => {
  it('returns only the workspace associated with a supported SSH session', () => {
    expect(portableConversationHistoryWorkspaceId(session, worktreeInfo)).toBe('remote-worktree')
  })

  it.each([
    [{ ...session, executionHostId: 'local' }, worktreeInfo],
    [{ ...session, agent: 'gemini' }, worktreeInfo],
    [{ ...session, filePath: '' }, worktreeInfo],
    [session, null]
  ] as const)('rejects unverifiable or unsupported history', (candidate, info) => {
    expect(portableConversationHistoryWorkspaceId(candidate, info)).toBeNull()
  })
})
