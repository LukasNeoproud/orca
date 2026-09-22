import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import {
  portableConversationSourceSessionId,
  type PortableConversationBranchRecord
} from '../../shared/portable-conversation-branch'
import { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import { portableConversationBranchFamily } from './portable-conversation-branch-delivery'
import {
  resolvePortableConversationBranchTarget,
  resolvePortableConversationFamilyTargets
} from './portable-conversation-branch-target-resolver'

const roots: string[] = []
const workspace = {
  workspaceId: 'worktree-a',
  path: '/repo',
  kind: 'git-worktree' as const,
  executionHostId: 'ssh:host-a' as const,
  connectionId: 'host-a',
  projectId: 'project-a'
}
const targetSource = {
  executionHostId: 'ssh:host-a' as const,
  workspace: { id: 'worktree-a', path: '/repo', kind: 'git-worktree' as const },
  provider: { agent: 'codex' as const, sessionId: 'provider-target' },
  transcriptPath: '/home/ada/.codex/sessions/target.jsonl'
}

function branch(): PortableConversationBranchRecord {
  return {
    schemaVersion: 1,
    branchId: 'branch-1',
    title: 'Portable task',
    relationKind: 'subtask',
    dependsOnBranchIds: [],
    source: {
      sessionId: 'portable-source',
      agent: 'codex',
      location: {
        executionHostId: 'ssh:host-a',
        wslDistro: null,
        workspaceId: 'worktree-a',
        workspaceKind: 'git-worktree'
      },
      anchor: { epoch: 'fingerprint', itemId: 'assistant-1' },
      excerpt: 'Source answer',
      portable: {
        source: {
          ...targetSource,
          provider: { agent: 'codex', sessionId: 'provider-source' },
          transcriptPath: '/sessions/source.jsonl'
        },
        anchor: {
          messageId: 'assistant-1',
          cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint' },
          identity: { fingerprint: 'fingerprint', size: 100, mtimeMs: 2 }
        },
        identity: { fingerprint: 'fingerprint', size: 100, mtimeMs: 2 },
        contextSha256: 'a'.repeat(64),
        projectId: 'project-a'
      }
    },
    target: {
      sessionId: 'portable-target-intent',
      agent: 'codex',
      location: {
        executionHostId: 'ssh:host-a',
        wslDistro: null,
        workspaceId: 'worktree-a',
        workspaceKind: 'git-worktree'
      },
      terminal: {
        workspace,
        launch: {
          attemptId: 'attempt-1',
          status: 'unknown',
          receipt: {
            tabId: 'tab-1',
            providerSession: { key: 'session_id', id: 'provider-target' }
          },
          reason: null
        }
      }
    },
    handoff: {
      mode: 'targeted',
      mechanism: 'portable-transcript',
      content: 'Exact task',
      contentSha256: 'b'.repeat(64),
      sourceItemIds: ['assistant-1'],
      historyPreview: null,
      historyPreviewSha256: null
    },
    providerFork: null,
    state: 'delivery-unverified',
    delivery: {
      clientMessageId: 'attempt-1',
      status: 'unknown',
      reason: null,
      submittedAt: 1,
      resolvedAt: 2
    },
    error: null,
    createdAt: 1,
    updatedAt: 2
  }
}

function history(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'history-target',
    executionHostId: 'ssh:host-a',
    agent: 'codex',
    sessionId: 'provider-target',
    title: 'Target',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: targetSource.transcriptPath,
    codexHome: '/home/ada/.codex',
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume provider-target',
    subagent: null,
    ...overrides
  }
}

async function setup(sessions: AiVaultSession[]) {
  const root = await mkdtemp(join(tmpdir(), 'orca-portable-resolve-'))
  roots.push(root)
  const store = await AgentSessionBranchStore.open(root)
  await store.put(branch())
  return {
    store,
    listSessions: vi.fn(async () => sessions),
    readPage: vi.fn(async ({ source }) => ({
      source,
      transcriptMessages: [],
      cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint' },
      nextCursor: null,
      identity: { fingerprint: 'fingerprint', size: 1, mtimeMs: 1 },
      limited: false,
      warnings: []
    })),
    resolveWorkspace: vi.fn(async () => workspace)
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable branch target resolution', () => {
  it('enriches one verified provider-id match and reconnects child-first family lookup', async () => {
    const dependencies = await setup([
      history(),
      history({
        id: 'subagent-row',
        filePath: '/repo/subagent.jsonl',
        subagent: { parentSessionId: 'provider-target', agentType: 'worker', status: 'completed' }
      })
    ])
    await resolvePortableConversationFamilyTargets(dependencies, targetSource)
    const resolved = dependencies.store.get('branch-1') as PortableConversationBranchRecord
    expect(resolved.target.terminal.launch?.receipt).toMatchObject({
      providerSession: { id: 'provider-target', transcriptPath: targetSource.transcriptPath },
      history: { filePath: targetSource.transcriptPath, cwd: '/repo' }
    })
    expect(dependencies.readPage).toHaveBeenCalledWith({ source: targetSource })
    expect(
      portableConversationBranchFamily(
        dependencies.store,
        portableConversationSourceSessionId(targetSource)
      ).branches.map((item) => item.branchId)
    ).toEqual(['branch-1'])
  })

  it('refuses duplicate provider matches without mutating the branch', async () => {
    const dependencies = await setup([
      history(),
      history({ id: 'duplicate', filePath: '/repo/other.jsonl' })
    ])
    const before = dependencies.store.get('branch-1')
    await expect(resolvePortableConversationBranchTarget(dependencies, 'branch-1')).rejects.toThrow(
      'portable_conversation_branch_target_unverifiable'
    )
    expect(dependencies.store.get('branch-1')).toEqual(before)
    expect(dependencies.readPage).not.toHaveBeenCalled()
  })

  it('keeps the branch unchanged when the controlling SSH host is unavailable', async () => {
    const dependencies = await setup([history()])
    dependencies.listSessions.mockRejectedValueOnce(new Error('ssh unavailable'))
    const before = dependencies.store.get('branch-1')
    await expect(resolvePortableConversationBranchTarget(dependencies, 'branch-1')).rejects.toThrow(
      'portable_conversation_branch_target_unverifiable'
    )
    expect(dependencies.store.get('branch-1')).toEqual(before)
    expect(dependencies.readPage).not.toHaveBeenCalled()
  })

  it('does not trust a child history path that differs from the unique scanned session', async () => {
    const dependencies = await setup([history()])
    const before = dependencies.store.get('branch-1')
    await expect(
      resolvePortableConversationFamilyTargets(dependencies, {
        ...targetSource,
        transcriptPath: '/forged/target.jsonl'
      })
    ).rejects.toThrow('portable_conversation_branch_target_unverifiable')
    expect(dependencies.store.get('branch-1')).toEqual(before)
    expect(dependencies.readPage).not.toHaveBeenCalled()
  })
})
