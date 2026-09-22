import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PortableConversationBranchRecord } from '../../shared/portable-conversation-branch'
import { portableConversationTerminalSessionId } from '../../shared/portable-conversation-branch'
import { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import {
  beginPortableConversationBranchStart,
  completePortableConversationBranchStart,
  portableConversationBranchFamily
} from './portable-conversation-branch-delivery'
import {
  beginPortableConversationBranchResult,
  completePortableConversationBranchResult,
  preparePortableConversationBranchResult
} from './portable-conversation-branch-results'

const roots: string[] = []
const workspace = {
  workspaceId: 'worktree-a',
  path: '/repo',
  kind: 'git-worktree' as const,
  executionHostId: 'ssh:host-a' as const,
  projectId: 'project-a'
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
          executionHostId: 'ssh:host-a',
          workspace: { id: 'worktree-a', path: '/repo', kind: 'git-worktree' },
          provider: { agent: 'codex', sessionId: 'source-provider' },
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
      terminal: { workspace, launch: null }
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
    state: 'prepared',
    delivery: null,
    error: null,
    createdAt: 1,
    updatedAt: 1
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'orca-portable-delivery-'))
  roots.push(root)
  const store = await AgentSessionBranchStore.open(root)
  await store.put(branch())
  return { root, store }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable conversation branch delivery', () => {
  it('durably claims once and never reauthorizes a pending or unknown launch', async () => {
    const { root, store } = await setup()
    expect(
      await beginPortableConversationBranchStart(
        store,
        { branchId: 'branch-1', attemptId: 'a1' },
        10
      )
    ).toMatchObject({ authorized: true, branch: { state: 'starting' } })
    expect(
      await beginPortableConversationBranchStart(
        store,
        { branchId: 'branch-1', attemptId: 'a1' },
        11
      )
    ).toMatchObject({ authorized: false })

    const reopened = await AgentSessionBranchStore.open(root)
    expect(
      await beginPortableConversationBranchStart(
        reopened,
        { branchId: 'branch-1', attemptId: 'a1' },
        12
      )
    ).toMatchObject({ authorized: false })
    await expect(
      beginPortableConversationBranchStart(reopened, { branchId: 'branch-1', attemptId: 'a2' }, 13)
    ).rejects.toThrow('portable_conversation_branch_delivery_in_flight')
  })

  it('stores unknown terminal delivery and enriches its provider alias without replay', async () => {
    const { store } = await setup()
    await beginPortableConversationBranchStart(store, { branchId: 'branch-1', attemptId: 'a1' }, 10)
    await completePortableConversationBranchStart(
      store,
      {
        branchId: 'branch-1',
        attemptId: 'a1',
        outcome: { kind: 'launched', receipt: { tabId: 'tab-1', paneKey: 'pane-1' } }
      },
      11
    )
    const providerSession = {
      key: 'session_id' as const,
      id: 'target-provider',
      transcriptPath: '/sessions/target.jsonl'
    }
    const enriched = await completePortableConversationBranchStart(
      store,
      {
        branchId: 'branch-1',
        attemptId: 'a1',
        outcome: {
          kind: 'launched',
          receipt: {
            tabId: 'tab-1',
            providerSession,
            history: { filePath: '/sessions/target.jsonl' }
          }
        }
      },
      12
    )
    expect(enriched.delivery?.status).toBe('unknown')
    expect(enriched.target.terminal.launch?.receipt).toMatchObject({
      tabId: 'tab-1',
      paneKey: 'pane-1',
      providerSession
    })
    const alias = portableConversationTerminalSessionId({
      executionHostId: 'ssh:host-a',
      agent: 'codex',
      providerSession
    })!
    expect(
      portableConversationBranchFamily(store, alias).branches.map((item) => item.branchId)
    ).toEqual(['branch-1'])
    expect(
      await beginPortableConversationBranchStart(store, { branchId: 'branch-1', attemptId: 'a1' })
    ).toMatchObject({ authorized: false })
  })

  it('claims return delivery durably and does not resend an unknown result', async () => {
    const { root, store } = await setup()
    const artifact = await preparePortableConversationBranchResult(
      store,
      {
        returnId: 'return-1',
        branchId: 'branch-1',
        content: '  Exact result\n'
      },
      20
    )
    expect(artifact.content).toBe('  Exact result\n')
    expect(
      await beginPortableConversationBranchResult(
        store,
        { returnId: 'return-1', attemptId: 'r1' },
        21
      )
    ).toMatchObject({ authorized: true })
    await completePortableConversationBranchResult(
      store,
      {
        returnId: 'return-1',
        attemptId: 'r1',
        status: 'unknown',
        reason: 'connection lost after write'
      },
      22
    )

    const reopened = await AgentSessionBranchStore.open(root)
    expect(
      await beginPortableConversationBranchResult(reopened, {
        returnId: 'return-1',
        attemptId: 'r1'
      })
    ).toMatchObject({ authorized: false })
    await expect(
      beginPortableConversationBranchResult(reopened, { returnId: 'return-1', attemptId: 'r2' })
    ).rejects.toThrow('portable_conversation_branch_delivery_in_flight')
    expect(portableConversationBranchFamily(reopened, 'portable-source').returns).toHaveLength(1)
  })
})
