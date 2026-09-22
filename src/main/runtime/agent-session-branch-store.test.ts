import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentSessionBranchRecord } from '../../shared/agent-session-branch'
import { AgentSessionBranchStore } from './agent-session-branch-store'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'

const roots: string[] = []
const location = (workspaceId: string): AgentSessionExecutionLocation => ({
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  wslDistro: null,
  workspaceId,
  workspaceKind: 'folder' as const
})

function branch(id: string, source: string, target: string): AgentSessionBranchRecord {
  return {
    schemaVersion: 1,
    branchId: id,
    title: id,
    relationKind: 'subtask',
    dependsOnBranchIds: [],
    source: {
      sessionId: source,
      agent: 'codex',
      location: location(source),
      anchor: { epoch: 'epoch', itemId: `item-${source}` },
      excerpt: `from ${source}`
    },
    target: { sessionId: target, agent: 'codex', location: location(target) },
    handoff: {
      mode: 'targeted',
      mechanism: 'portable-transcript',
      content: `work ${id}`,
      contentSha256: 'a'.repeat(64),
      sourceItemIds: [`item-${source}`],
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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AgentSessionBranchStore', () => {
  it('restores a full transitive family and preserves separate branch points', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branches-'))
    roots.push(root)
    const store = await AgentSessionBranchStore.open(root)
    await store.put(branch('b1', 'parent', 'child-a'))
    await store.put(branch('b2', 'parent', 'child-b'))
    await store.put(branch('b3', 'child-a', 'grandchild'))

    const reopened = await AgentSessionBranchStore.open(root)
    expect(
      reopened
        .family('grandchild')
        .map((item) => item.branchId)
        .sort()
    ).toEqual(['b1', 'b2', 'b3'])
    expect(reopened.wouldCreateCycle('grandchild', 'parent')).toBe(true)
    expect(reopened.wouldCreateCycle('child-b', 'unrelated')).toBe(false)
  })

  it('indexes immutable return artifacts from both conversations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branches-'))
    roots.push(root)
    const store = await AgentSessionBranchStore.open(root)
    await store.putReturn({
      schemaVersion: 1,
      returnId: 'result-1',
      branchId: 'branch-1',
      sourceSessionId: 'child-session',
      targetSessionId: 'parent-session',
      content: 'Verified result',
      contentSha256: 'b'.repeat(64),
      delivery: null,
      integrationState: 'reported',
      createdAt: 1,
      updatedAt: 1
    })
    expect(store.returnsFor('child-session')).toHaveLength(1)
    expect(store.returnsFor('parent-session')).toHaveLength(1)
    expect(store.returnsFor('unrelated')).toEqual([])
  })
})
