import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationProposalRecord } from '../../shared/portable-conversation-proposal'
import type { PortableConversationSource } from '../../shared/portable-conversation-source'
import { portableConversationSourceSessionId } from '../../shared/portable-conversation-branch'
import { portableConversationContentHash } from './portable-conversation-branch-service'
import { PortableConversationProposalStore } from './portable-conversation-proposal-store'
import { confirmPortableConversationProposal } from './portable-conversation-proposal-service'

const roots: string[] = []
const source = (sessionId: string, workspaceId: string): PortableConversationSource => ({
  executionHostId: 'ssh:builder',
  workspace: { id: workspaceId, path: `/srv/${workspaceId}`, kind: 'folder' },
  provider: { agent: 'codex', sessionId },
  transcriptPath: `/history/${sessionId}.jsonl`
})
const parent = source('parent-provider', 'source-workspace')
const attached = source('attached-provider', 'target-workspace')
const anchor = {
  messageId: 'user-1',
  cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint-1' },
  identity: { fingerprint: 'fingerprint-1', size: 100, mtimeMs: 10 }
}
const context = {
  source: parent,
  anchor,
  identity: anchor.identity,
  verification: { cursor: anchor.cursor, selectedMessageId: anchor.messageId },
  selectedPassage: 'Build the API and UI independently.',
  contextMarkdown: '## Selected passage\n\nBuild the API and UI independently.',
  historyTruncated: false,
  warnings: []
}

function record(): PortableConversationProposalRecord {
  const item = (id: string, workspaceId: string) => ({
    itemId: id,
    branchId: `branch-${id}`,
    name: `Part ${id}`,
    scope: `Implement ${id}.`,
    verification: `Test ${id}.`,
    dependencyIds: [],
    workspaceId,
    context: { content: `Context ${id}.`, sourceItemIds: ['user-1'] },
    relationKind: 'subtask' as const,
    action: 'prepare' as const,
    targetSessionId: `target-${id}`,
    uncertain: false
  })
  return {
    schemaVersion: 1,
    proposal: {
      proposalId: 'proposal-1',
      source: {
        sessionId: portableConversationSourceSessionId(parent),
        workspaceId: parent.workspace.id,
        kind: 'prompt',
        anchor: { epoch: anchor.identity.fingerprint, itemId: anchor.messageId },
        passages: [{ itemId: anchor.messageId, text: context.selectedPassage }]
      },
      items: [
        {
          ...item('one', 'target-workspace'),
          intent: {
            kind: 'prepare',
            targetSessionId: 'target-one',
            agent: 'codex',
            workspaceId: 'target-workspace',
            executionHostId: 'ssh:builder'
          }
        },
        {
          ...item('two', 'target-workspace'),
          action: 'attach',
          targetSessionId: portableConversationSourceSessionId(attached),
          intent: { kind: 'attach', target: attached }
        }
      ],
      shouldOffer: true,
      analysis: 'deterministic',
      truncated: false
    },
    portable: {
      source: parent,
      anchor,
      identity: anchor.identity,
      contextSha256: portableConversationContentHash(context.contextMarkdown),
      projectId: 'project-1'
    },
    revision: 1,
    state: 'offered',
    results: [],
    createdAt: 1,
    updatedAt: 1
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable conversation proposals', () => {
  it('persists partial-safe prepare and attach outcomes across restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-proposals-'))
    roots.push(root)
    const proposalStore = await PortableConversationProposalStore.open(root)
    const branchStore = await AgentSessionBranchStore.open(root)
    await proposalStore.put(record(), 0)
    const dependencies = {
      store: proposalStore,
      branchStore,
      readContext: async () => context,
      readSession: async () => ({}),
      resolveWorkspace: async (workspaceId: string) => ({
        workspaceId,
        path: `/srv/${workspaceId}`,
        kind: 'folder' as const,
        executionHostId: 'ssh:builder' as const,
        connectionId: 'builder',
        projectId: 'project-1'
      }),
      now: () => 2
    }

    const confirmed = await confirmPortableConversationProposal(dependencies, 'proposal-1', 1)
    expect(confirmed.batch.items.map((item) => item.status).sort()).toEqual([
      'attached',
      'prepared'
    ])
    expect(branchStore.get('branch-one')?.state).toBe('prepared')
    expect(branchStore.get('branch-two')?.state).toBe('started')
    expect(proposalStore.notices('proposal-1')).toHaveLength(1)

    const reopened = await PortableConversationProposalStore.open(root)
    expect(reopened.get('proposal-1')).toMatchObject({ state: 'confirmed', revision: 2 })
    expect(reopened.get('proposal-1')?.results).toHaveLength(2)
  })

  it('uses CAS for edited proposals and scoped preferences', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-proposals-'))
    roots.push(root)
    const store = await PortableConversationProposalStore.open(root)
    await store.put(record(), 0)
    await expect(store.put({ ...record(), revision: 2 }, 0)).rejects.toThrow(
      'portable_conversation_proposal_stale'
    )
    await store.setPreference('workspace', 'session-1', 'source-workspace', false)
    expect(store.preference('another-session', 'source-workspace')).toEqual({
      enabled: false,
      source: 'workspace'
    })
  })

  it('recovers an exact older proposal while newest lookup follows the source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-proposals-'))
    roots.push(root)
    const store = await PortableConversationProposalStore.open(root)
    const first = record()
    const second = {
      ...record(),
      proposal: { ...record().proposal, proposalId: 'proposal-2' },
      createdAt: 2,
      updatedAt: 2
    }
    await store.put(first, 0)
    await store.put(second, 0)
    const sessionId = portableConversationSourceSessionId(parent)

    expect(store.forSession(sessionId)?.proposal.proposalId).toBe('proposal-2')
    expect(store.forSession(sessionId, 'proposal-1')?.proposal.proposalId).toBe('proposal-1')
    expect(store.forSession('another-source', 'proposal-1')).toBeNull()
  })

  it('refuses inconsistent durable intents before confirming the proposal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-proposals-'))
    roots.push(root)
    const proposalStore = await PortableConversationProposalStore.open(root)
    const branchStore = await AgentSessionBranchStore.open(root)
    const inconsistent = record()
    inconsistent.proposal.items[1] = {
      ...inconsistent.proposal.items[1]!,
      targetSessionId: 'forged-target'
    }
    await proposalStore.put(inconsistent, 0)

    await expect(
      confirmPortableConversationProposal(
        {
          store: proposalStore,
          branchStore,
          readContext: async () => context,
          readSession: async () => ({}),
          resolveWorkspace: async (workspaceId: string) => ({
            workspaceId,
            path: `/srv/${workspaceId}`,
            kind: 'folder',
            executionHostId: 'ssh:builder',
            connectionId: 'builder',
            projectId: 'project-1'
          })
        },
        'proposal-1',
        1
      )
    ).rejects.toThrow('portable_conversation_proposal_intent_mismatch')
    expect(proposalStore.get('proposal-1')?.state).toBe('offered')
  })

  it('creates an immutable notice for each newly successful retry delta', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-proposals-'))
    roots.push(root)
    const proposalStore = await PortableConversationProposalStore.open(root)
    const branchStore = await AgentSessionBranchStore.open(root)
    const delayed = record()
    const delayedTarget = source('attached-later', 'later-workspace')
    delayed.proposal.items[1] = {
      ...delayed.proposal.items[1]!,
      workspaceId: 'later-workspace',
      targetSessionId: portableConversationSourceSessionId(delayedTarget),
      intent: { kind: 'attach', target: delayedTarget }
    }
    await proposalStore.put(delayed, 0)
    let unavailable = true
    const dependencies = {
      store: proposalStore,
      branchStore,
      readContext: async () => context,
      readSession: async () => ({}),
      resolveWorkspace: async (workspaceId: string) => {
        if (unavailable && workspaceId === 'later-workspace') {
          throw new Error('remote unavailable')
        }
        return {
          workspaceId,
          path: `/srv/${workspaceId}`,
          kind: 'folder' as const,
          executionHostId: 'ssh:builder' as const,
          connectionId: 'builder',
          projectId: 'project-1'
        }
      }
    }
    const first = await confirmPortableConversationProposal(dependencies, 'proposal-1', 1)
    expect(first.batch.items.map((item) => item.status).sort()).toEqual(['failed', 'prepared'])
    expect(proposalStore.notices('proposal-1')).toHaveLength(1)

    unavailable = false
    const retried = await confirmPortableConversationProposal(dependencies, 'proposal-1', 2, [
      'two'
    ])
    expect(retried.batch.items.find((item) => item.itemId === 'two')?.status).toBe('attached')
    expect(proposalStore.notices('proposal-1')).toHaveLength(2)
    expect(
      new Set(proposalStore.notices('proposal-1').flatMap((notice) => notice.branchIds)).size
    ).toBe(2)
  })
})
