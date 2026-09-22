import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestRepo = ReturnType<typeof repo>
type TestWorktree = ReturnType<typeof worktree>
type TestFolder = {
  id: string
  projectGroupId: string
  folderPath: string
  name: string
  executionHostId: string
}

const state = vi.hoisted(() => ({
  repos: [] as TestRepo[],
  worktreesByRepo: {} as Record<string, TestWorktree[]>,
  detectedWorktreesByRepo: {} as Record<string, { worktrees: TestWorktree[] }>,
  folderWorkspaces: [] as TestFolder[],
  getKnownWorktreeById: vi.fn<(id: string, host?: string) => TestWorktree | undefined>()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))

import {
  getBacklogTaskWorkspaceOptions,
  getBacklogTaskConversationOptions
} from './backlog-task-handoff-options'

const localRoute = {
  workspaceId: 'repo-a::/source',
  executionHostId: 'local' as const,
  runtimeEnvironmentId: null
}

function repo(id: string, owner: string, hostId = 'local') {
  return {
    id,
    executionHostId: hostId,
    connectionId: null,
    upstream: { owner, repo: 'project' },
    repoIcon: null,
    gitRemoteIdentity: null,
    projectGroupId: 'visual-group'
  }
}

function worktree(id: string, repoId: string, path: string, hostId = 'local') {
  return { id, repoId, path, hostId, displayName: id }
}

describe('getBacklogTaskWorkspaceOptions', () => {
  beforeEach(() => {
    state.repos = []
    state.worktreesByRepo = {}
    state.detectedWorktreesByRepo = {}
    state.folderWorkspaces = []
    state.getKnownWorktreeById.mockReset()
  })

  it('never reads the controlling host history for a paired runtime SSH connection', async () => {
    const listSessions = vi.fn()
    vi.stubGlobal('window', { api: { aiVault: { listSessions } } })
    try {
      await expect(
        getBacklogTaskConversationOptions({
          ...localRoute,
          executionHostId: 'ssh:same-id',
          runtimeEnvironmentId: 'remote-owner'
        })
      ).resolves.toEqual([])
      expect(listSessions).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('matches the backend project identity and host, including detected worktrees', () => {
    const source = worktree(localRoute.workspaceId, 'repo-a', '/source')
    const sibling = worktree('repo-b::/sibling', 'repo-b', '/sibling')
    const detected = worktree('repo-b::/detected', 'repo-b', '/detected')
    const groupedOtherProject = worktree('repo-c::/other', 'repo-c', '/other')
    const sameProjectOtherHost = worktree('repo-d::/remote', 'repo-d', '/remote', 'ssh:remote')
    state.repos = [
      repo('repo-a', 'team'),
      repo('repo-b', 'team'),
      repo('repo-c', 'different'),
      repo('repo-d', 'team', 'ssh:remote')
    ]
    state.worktreesByRepo = {
      'repo-a': [source],
      'repo-b': [sibling],
      'repo-c': [groupedOtherProject],
      'repo-d': [sameProjectOtherHost]
    }
    state.detectedWorktreesByRepo = { 'repo-b': { worktrees: [sibling, detected] } }
    const byId = new Map([source, sibling, detected].map((row) => [row.id, row]))
    state.getKnownWorktreeById.mockImplementation((id, host) =>
      host === 'local' ? byId.get(id) : undefined
    )

    expect(getBacklogTaskWorkspaceOptions(localRoute).map((row) => row.id)).toEqual([
      source.id,
      sibling.id,
      detected.id
    ])
  })

  it('keeps folder projects independent even when they share a sidebar group', () => {
    state.folderWorkspaces = [
      {
        id: 'one',
        projectGroupId: 'group',
        folderPath: '/one',
        name: 'One',
        executionHostId: 'local'
      },
      {
        id: 'two',
        projectGroupId: 'group',
        folderPath: '/two',
        name: 'Two',
        executionHostId: 'local'
      }
    ]
    state.getKnownWorktreeById.mockImplementation((id) => {
      const folder = state.folderWorkspaces.find((entry) => `folder:${entry.id}` === id)
      return folder
        ? {
            id,
            repoId: `folder-workspace:${folder.projectGroupId}`,
            path: folder.folderPath,
            hostId: 'local',
            displayName: folder.name
          }
        : undefined
    })
    const route = { ...localRoute, workspaceId: 'folder:one' }

    expect(getBacklogTaskWorkspaceOptions(route).map((row) => row.id)).toEqual(['folder:one'])
  })
})
