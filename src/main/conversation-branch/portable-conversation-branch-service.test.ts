import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationBranchPrepareParams } from '../../shared/portable-conversation-branch'
import type { PortableConversationSourceContext } from '../../shared/portable-conversation-source'
import { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationWorkspace } from '../runtime/portable-conversation-workspace'
import {
  portableConversationContentHash,
  preparePortableConversationBranch
} from './portable-conversation-branch-service'

const roots: string[] = []
const anchor = {
  messageId: 'assistant-1',
  cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint-1' },
  identity: { fingerprint: 'fingerprint-1', size: 100, mtimeMs: 20 }
}
const source = {
  executionHostId: 'ssh:host-a' as const,
  workspace: { id: 'source-worktree', path: '/repo/source', kind: 'git-worktree' as const },
  provider: { agent: 'codex' as const, sessionId: 'provider-source' },
  transcriptPath: '/home/ada/.codex/sessions/provider-source.jsonl'
}

function context(overrides: Partial<PortableConversationSourceContext> = {}) {
  return {
    source,
    anchor,
    identity: anchor.identity,
    verification: { cursor: anchor.cursor, selectedMessageId: anchor.messageId },
    selectedPassage: 'The verified answer',
    contextMarkdown: '## Portable transcript context\n\nThe verified answer',
    historyTruncated: false,
    warnings: [],
    ...overrides
  } satisfies PortableConversationSourceContext
}

function params(mode: 'history' | 'targeted' = 'history'): PortableConversationBranchPrepareParams {
  const preview = context()
  return {
    branchId: 'branch-1',
    title: 'Investigate portable branch',
    relationKind: 'subtask',
    source,
    anchor,
    target: {
      sessionId: 'portable-target-intent-1',
      agent: 'codex',
      workspaceId: 'target-worktree',
      executionHostId: 'ssh:host-a'
    },
    handoff: {
      mode,
      content: '  Exact editable handoff\n',
      sourceContextSha256: portableConversationContentHash(preview.contextMarkdown)
    }
  }
}

function workspace(id: string, overrides: Partial<PortableConversationWorkspace> = {}) {
  return {
    workspaceId: id,
    path: id === 'source-worktree' ? '/repo/source' : '/repo/target',
    kind: 'git-worktree' as const,
    executionHostId: 'ssh:host-a' as const,
    connectionId: 'host-a',
    projectId: 'project-a',
    ...overrides
  }
}

async function setup(read = context()) {
  const root = await mkdtemp(join(tmpdir(), 'orca-portable-branch-'))
  roots.push(root)
  const store = await AgentSessionBranchStore.open(root)
  const readContext = vi.fn(async () => read)
  const resolveWorkspace = vi.fn(async (id: string) => workspace(id))
  return { root, store, readContext, resolveWorkspace }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable conversation branch prepare', () => {
  it('re-reads the source proof and persists exact content without launching anything', async () => {
    const dependencies = await setup()
    const prepared = await preparePortableConversationBranch(dependencies, params())

    expect(dependencies.readContext).toHaveBeenCalledOnce()
    expect(prepared.handoff.content).toBe('  Exact editable handoff\n')
    expect(prepared.handoff.mechanism).toBe('portable-transcript')
    expect(prepared.state).toBe('prepared')
    expect(prepared.target.terminal.launch).toBeNull()
    expect(prepared.source.portable.contextSha256).toBe(
      portableConversationContentHash(context().contextMarkdown)
    )
    expect((await AgentSessionBranchStore.open(dependencies.root)).get('branch-1')).toMatchObject({
      branchId: 'branch-1',
      state: 'prepared'
    })
  })

  it('rejects incomplete history while allowing the same source as targeted context', async () => {
    const dependencies = await setup(context({ historyTruncated: true }))
    await expect(
      preparePortableConversationBranch(dependencies, params('history'))
    ).rejects.toThrow('portable_conversation_branch_history_truncated')
    await expect(
      preparePortableConversationBranch(dependencies, params('targeted'))
    ).resolves.toMatchObject({ handoff: { mode: 'targeted' } })
  })

  it('rejects stale proof and cross-project or cross-host targets before persistence', async () => {
    const dependencies = await setup()
    const stale = params()
    stale.handoff.sourceContextSha256 = 'a'.repeat(64)
    await expect(preparePortableConversationBranch(dependencies, stale)).rejects.toThrow(
      'portable_conversation_branch_preview_stale'
    )

    dependencies.resolveWorkspace.mockImplementation(async (id: string) =>
      workspace(id, id === 'target-worktree' ? { projectId: 'project-b' } : {})
    )
    await expect(preparePortableConversationBranch(dependencies, params())).rejects.toThrow(
      'portable_conversation_branch_target_mismatch'
    )
    dependencies.resolveWorkspace.mockImplementation(async (id: string) =>
      workspace(
        id,
        id === 'target-worktree' ? { executionHostId: 'ssh:host-b', connectionId: 'host-b' } : {}
      )
    )
    await expect(preparePortableConversationBranch(dependencies, params())).rejects.toThrow(
      'portable_conversation_branch_target_mismatch'
    )
    expect(dependencies.store.get('branch-1')).toBeNull()
  })

  it('replays an identical prepare and rejects changed immutable intent', async () => {
    const dependencies = await setup()
    const first = await preparePortableConversationBranch(dependencies, params())
    const replay = await preparePortableConversationBranch(dependencies, params())
    expect(replay).toEqual(first)

    const changed = params()
    changed.handoff.content = 'Different handoff'
    await expect(preparePortableConversationBranch(dependencies, changed)).rejects.toThrow(
      'portable_conversation_branch_operation_conflict'
    )
  })
})
