import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { BacklogTaskAssociation } from '../../shared/backlog-task-association'

vi.mock('./backlog-target', () => ({
  resolveBacklogTarget: vi.fn(async (_runtime, workspaceId: string, expectedHost?: string) => {
    const executionHostId = workspaceId.includes('remote') ? 'ssh:box' : 'local'
    if (expectedHost && expectedHost !== executionHostId) {
      throw new Error('backlog_execution_host_mismatch')
    }
    return {
      kind: executionHostId === 'local' ? 'local' : 'ssh',
      workspaceId,
      executionHostId,
      target: { key: workspaceId, spawn: vi.fn() }
    }
  })
}))

import {
  confirmBacklogTaskAssociation,
  getBacklogTaskAssociation,
  listBacklogTaskAssociations,
  upsertBacklogTaskAssociation
} from './backlog-task-association-service'

const SOURCE = 'repo-a::/project/source'
const TARGET = 'repo-a::/project/target'

function makeRuntime() {
  let associations: BacklogTaskAssociation[] = []
  const persist = vi.fn((next: readonly BacklogTaskAssociation[]) => {
    associations = [...structuredClone(next)]
  })
  const runtime = {
    listRepos: () => [
      { id: 'repo-a', path: '/project', executionHostId: 'local' },
      { id: 'repo-b', path: '/other', executionHostId: 'local' },
      { id: 'repo-a', path: '/remote', executionHostId: 'ssh:box' }
    ],
    listFolderWorkspaces: () => [{ id: 'folder-a' }, { id: 'folder-b' }],
    getBacklogTaskAssociations: () => structuredClone(associations),
    persistBacklogTaskAssociations: persist
  } as unknown as OrcaRuntimeService
  return { runtime, persist, read: () => associations }
}

function write(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: SOURCE,
    taskId: 'TASK-7',
    targetWorkspace: { workspaceId: TARGET, kind: 'git-worktree' as const },
    session: {
      structuredSessionId: 'session-1',
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      history: { filePath: '/history/session.jsonl', codexHome: '/codex', cwd: '/project' }
    },
    terminal: { tabId: 'tab-1', leafId: 'leaf-1', paneKey: 'pane-1', ptyId: 'pty-1' },
    attemptId: 'attempt-1',
    deliveryStatus: 'pending' as const,
    expectedAttemptId: null,
    ...overrides
  }
}

describe('Backlog task associations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists and reads the full restoration record by project, host, and task', async () => {
    const { runtime, persist } = makeRuntime()
    const association = await upsertBacklogTaskAssociation(runtime, write())

    expect(association).toMatchObject({
      projectId: 'repo:repo-a',
      executionHostId: 'local',
      sourceWorkspace: { workspaceId: SOURCE, kind: 'git-worktree' },
      targetWorkspace: { workspaceId: TARGET, kind: 'git-worktree' },
      session: { history: { filePath: '/history/session.jsonl' } },
      terminal: { tabId: 'tab-1' },
      deliveryStatus: 'pending'
    })
    expect(persist).toHaveBeenCalledOnce()
    await expect(
      getBacklogTaskAssociation(runtime, { workspaceId: TARGET, taskId: 'TASK-7' })
    ).resolves.toEqual(association)
  })

  it('lists only associations for the source project and host', async () => {
    const { runtime } = makeRuntime()
    const local = await upsertBacklogTaskAssociation(runtime, write())
    await upsertBacklogTaskAssociation(
      runtime,
      write({
        workspaceId: 'repo-b::/other',
        targetWorkspace: { workspaceId: 'repo-b::/other', kind: 'git-worktree' }
      })
    )
    await upsertBacklogTaskAssociation(
      runtime,
      write({
        workspaceId: 'repo-a::/remote',
        targetWorkspace: { workspaceId: 'repo-a::/remote', kind: 'git-worktree' }
      })
    )
    await expect(listBacklogTaskAssociations(runtime, { workspaceId: SOURCE })).resolves.toEqual([
      local
    ])
  })

  it('attempt-fences status updates and confirmation', async () => {
    const { runtime } = makeRuntime()
    await upsertBacklogTaskAssociation(runtime, write())
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({ attemptId: 'attempt-stale', expectedAttemptId: null, deliveryStatus: 'unverified' })
      )
    ).rejects.toThrow('backlog_task_association_attempt_conflict')

    await upsertBacklogTaskAssociation(
      runtime,
      write({ attemptId: 'attempt-2', expectedAttemptId: 'attempt-1' })
    )
    await expect(
      confirmBacklogTaskAssociation(runtime, {
        workspaceId: SOURCE,
        taskId: 'TASK-7',
        attemptId: 'attempt-1'
      })
    ).rejects.toThrow('backlog_task_association_attempt_conflict')
    await expect(
      confirmBacklogTaskAssociation(runtime, {
        workspaceId: SOURCE,
        taskId: 'TASK-7',
        attemptId: 'attempt-2'
      })
    ).resolves.toMatchObject({ deliveryStatus: 'confirmed', attemptId: 'attempt-2' })
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({
          attemptId: 'attempt-2',
          expectedAttemptId: 'attempt-2',
          deliveryStatus: 'unverified'
        })
      )
    ).rejects.toThrow('backlog_task_association_delivery_conflict')
  })

  it('rejects a target on another project or execution host', async () => {
    const { runtime, persist } = makeRuntime()
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({
          targetWorkspace: { workspaceId: 'repo-b::/other/target', kind: 'git-worktree' }
        })
      )
    ).rejects.toThrow('backlog_task_association_target_mismatch')
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({
          targetWorkspace: { workspaceId: 'repo-a::/remote/target', kind: 'git-worktree' }
        })
      )
    ).rejects.toThrow('backlog_execution_host_mismatch')
    expect(persist).not.toHaveBeenCalled()
  })

  it('uses the folder workspace identity as the project key', async () => {
    const { runtime } = makeRuntime()
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({
          workspaceId: 'folder:folder-a',
          targetWorkspace: { workspaceId: 'folder:folder-a', kind: 'folder' }
        })
      )
    ).resolves.toMatchObject({
      projectId: 'folder:folder-a',
      sourceWorkspace: { kind: 'folder' },
      targetWorkspace: { kind: 'folder' }
    })
  })

  it('keeps direct SSH associations in the controlling runtime collection', async () => {
    const { runtime, persist } = makeRuntime()
    await expect(
      upsertBacklogTaskAssociation(
        runtime,
        write({
          workspaceId: 'repo-a::/remote/source',
          executionHostId: 'ssh:box',
          targetWorkspace: {
            workspaceId: 'repo-a::/remote/target',
            kind: 'git-worktree'
          }
        })
      )
    ).resolves.toMatchObject({ executionHostId: 'ssh:box' })
    expect(persist).toHaveBeenCalledOnce()
  })
})
