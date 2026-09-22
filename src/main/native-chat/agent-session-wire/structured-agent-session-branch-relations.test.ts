import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentSessionBranchRecord } from '../../../shared/agent-session-branch'
import type { AgentSessionExecutionLocation } from '../../../shared/agent-session-record'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { AgentSessionBranchStore } from '../../runtime/agent-session-branch-store'
import {
  attachExistingAgentSessionBranch,
  prepareAgentSessionBranchResult
} from './structured-agent-session-branch-relations'

const roots: string[] = []

function branch(): AgentSessionBranchRecord {
  const location: AgentSessionExecutionLocation = {
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    wslDistro: null,
    workspaceId: 'workspace',
    workspaceKind: 'folder' as const
  }
  return {
    schemaVersion: 1,
    branchId: 'branch-1',
    title: 'Branch',
    relationKind: 'subtask',
    dependsOnBranchIds: [],
    source: {
      sessionId: 'parent',
      agent: 'codex',
      location,
      anchor: { epoch: 'epoch', itemId: 'response' },
      excerpt: 'response'
    },
    target: { sessionId: 'child', agent: 'codex', location },
    handoff: {
      mode: 'targeted',
      mechanism: 'portable-transcript',
      content: 'Work on the child.',
      contentSha256: 'a'.repeat(64),
      sourceItemIds: ['response'],
      historyPreview: null,
      historyPreviewSha256: null
    },
    providerFork: null,
    state: 'started',
    delivery: null,
    error: null,
    createdAt: 1,
    updatedAt: 1
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('agent session branch relations', () => {
  it('preserves attached handoff indentation and trailing Markdown exactly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branch-relations-'))
    roots.push(root)
    const branchStore = await AgentSessionBranchStore.open(root)
    const sourceItemId = agentJournalItemKey({ provider: 'orca', clientMessageId: 'prompt-1' })
    const sourceRecord = {
      provider: 'codex',
      providerHandleChain: [
        {
          linkId: 'link-1',
          handle: { provider: 'codex', threadId: 'thread-1' },
          origin: 'created',
          mintedAtFence: 1,
          observedAt: 1
        }
      ],
      location: branch().source.location
    }
    const host = {
      revealSession: async () => ({}),
      flushStreamedEvents: async () => undefined,
      deps: {
        branchStore,
        adapter: { supportsConversationFork: () => true },
        store: {
          getRecord: (sessionId: string) =>
            sessionId === 'source' ? sourceRecord : { ...sourceRecord, sessionId: 'target' }
        }
      },
      journalSnapshot: () => ({
        cursor: { epoch: 'epoch', sequence: 1 },
        items: [
          {
            itemId: sourceItemId,
            revision: 1,
            sequence: 1,
            observedAt: 1,
            body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'prompt' }] }
          }
        ],
        submissions: []
      })
    }
    const content = '  ```ts\n  const answer = 42\n  ```\n\n'

    const attached = await attachExistingAgentSessionBranch({
      host: host as never,
      params: {
        branchId: 'attached-1',
        title: 'Attached',
        sourceSessionId: 'source',
        expectedEpoch: 'epoch',
        sourceItemId,
        relationKind: 'discussion',
        targetSessionId: 'target',
        handoff: { content, sourceItemIds: [sourceItemId] }
      }
    })

    expect(attached.handoff.content).toBe(content)
    expect(branchStore.get('attached-1')?.handoff.content).toBe(content)
  })

  it('preserves result indentation and trailing Markdown exactly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branch-relations-'))
    roots.push(root)
    const branchStore = await AgentSessionBranchStore.open(root)
    await branchStore.put(branch())
    const content = '  ```ts\n  const answer = 42\n  ```\n\n'

    const result = await prepareAgentSessionBranchResult({
      host: { deps: { branchStore } } as never,
      params: { returnId: 'return-1', branchId: 'branch-1', content }
    })

    expect(result.content).toBe(content)
    expect(branchStore.getReturn('return-1')?.content).toBe(content)
  })
})
