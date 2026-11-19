import { describe, expect, it } from 'vitest'
import type {
  WorktreeOperationOwnerRecord,
  WorktreeOperationRouteState
} from '@/lib/worktree-operation-route'
import { isAndroidWorkspaceOnThisMachine } from './android-app-run-host'

const WORKTREE_ID = 'repo-1::/srv/app'

function rows(
  hostId: WorktreeOperationOwnerRecord['hostId'],
  runtimeOwnerEnvironmentId?: string
): WorktreeOperationRouteState {
  return {
    repos: [{ id: 'repo-1' }],
    worktreesByRepo: {
      'repo-1': [{ id: WORKTREE_ID, repoId: 'repo-1', hostId, runtimeOwnerEnvironmentId }]
    }
  }
}

describe('isAndroidWorkspaceOnThisMachine', () => {
  it('builds only a workspace this machine owns', () => {
    expect(isAndroidWorkspaceOnThisMachine(rows('local'), WORKTREE_ID)).toBe(true)
    expect(isAndroidWorkspaceOnThisMachine(rows('ssh:box'), WORKTREE_ID)).toBe(false)
    expect(isAndroidWorkspaceOnThisMachine(rows('runtime:env-a', 'env-a'), WORKTREE_ID)).toBe(false)
    expect(isAndroidWorkspaceOnThisMachine({}, WORKTREE_ID)).toBe(false)
  })

  it('ignores the Active Server', () => {
    const focus = {
      settings: { activeRuntimeEnvironmentId: 'env-a' },
      runtimeEnvironments: [{ id: 'env-a' }],
      runtimeEnvironmentCatalogHydrated: true
    }
    expect(isAndroidWorkspaceOnThisMachine({ ...rows(undefined), ...focus }, WORKTREE_ID)).toBe(
      true
    )
    expect(isAndroidWorkspaceOnThisMachine(focus, WORKTREE_ID)).toBe(false)
  })
})
