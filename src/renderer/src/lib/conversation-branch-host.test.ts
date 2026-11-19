import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../shared/tab-types'
import type {
  WorktreeOperationOwnerRecord,
  WorktreeOperationRouteState
} from './worktree-operation-route'

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { state, activateTab: vi.fn(() => true) }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: mocks.activateTab
}))

import {
  activateConversationBranchChatTab,
  conversationBranchWorkspaceTarget
} from './conversation-branch-host'

const WORKTREE_ID = 'repo-1::/srv/w'
const ENV_A = { kind: 'environment', environmentId: 'env-a' } as const
const FOCUS_ON_ENV_A = {
  settings: { activeRuntimeEnvironmentId: 'env-a' },
  runtimeEnvironments: [{ id: 'env-a' }],
  runtimeEnvironmentCatalogHydrated: true
}

function rows(
  hostId?: WorktreeOperationOwnerRecord['hostId'],
  runtimeOwnerEnvironmentId?: string
): WorktreeOperationRouteState {
  return {
    repos: [{ id: 'repo-1' }],
    worktreesByRepo: {
      'repo-1': [{ id: WORKTREE_ID, repoId: 'repo-1', hostId, runtimeOwnerEnvironmentId }]
    }
  }
}

function chatTab(id: string, executionHostId?: Tab['executionHostId']): Partial<Tab> {
  return {
    id,
    worktreeId: WORKTREE_ID,
    contentType: 'agent-session',
    entityId: 'session-1',
    ...(executionHostId ? { executionHostId } : {})
  }
}

describe('conversationBranchWorkspaceTarget', () => {
  it('names the runtime that owns the workspace', () => {
    expect(conversationBranchWorkspaceTarget(rows('local'), WORKTREE_ID)).toEqual({
      kind: 'local'
    })
    expect(conversationBranchWorkspaceTarget(rows('runtime:env-a', 'env-a'), WORKTREE_ID)).toEqual(
      ENV_A
    )
  })

  it('names none for an SSH place or a workspace no row places', () => {
    expect(conversationBranchWorkspaceTarget(rows('ssh:box'), WORKTREE_ID)).toBeNull()
    expect(conversationBranchWorkspaceTarget(rows('ssh:t', 'env-a'), WORKTREE_ID)).toBeNull()
    expect(conversationBranchWorkspaceTarget(FOCUS_ON_ENV_A, WORKTREE_ID)).toBeNull()
  })

  it('ignores the Active Server', () => {
    expect(
      conversationBranchWorkspaceTarget({ ...rows(), ...FOCUS_ON_ENV_A }, WORKTREE_ID)
    ).toEqual({ kind: 'local' })
  })
})

describe('activateConversationBranchChatTab', () => {
  beforeEach(() => {
    mocks.activateTab.mockClear()
  })

  it("shows the member's chat on the family's host, not a same-session chat elsewhere", () => {
    mocks.state = {
      ...rows('local'),
      unifiedTabsByWorktree: {
        [WORKTREE_ID]: [chatTab('chat-local', 'local'), chatTab('chat-env-a', 'runtime:env-a')]
      }
    }
    const location = { worktreeId: WORKTREE_ID, sessionId: 'session-1', target: ENV_A }

    expect(activateConversationBranchChatTab(location)).toBe(true)
    expect(mocks.activateTab).toHaveBeenCalledWith({
      worktreeId: WORKTREE_ID,
      tabId: 'chat-env-a',
      target: ENV_A
    })
  })

  it("places an unstamped tab with its workspace's owner, never the Active Server", () => {
    mocks.state = {
      ...rows('local'),
      ...FOCUS_ON_ENV_A,
      unifiedTabsByWorktree: { [WORKTREE_ID]: [chatTab('chat-old')] }
    }

    expect(
      activateConversationBranchChatTab({
        worktreeId: WORKTREE_ID,
        sessionId: 'session-1',
        target: ENV_A
      })
    ).toBe(false)
    expect(
      activateConversationBranchChatTab({
        worktreeId: WORKTREE_ID,
        sessionId: 'session-1',
        target: { kind: 'local' }
      })
    ).toBe(true)
    expect(mocks.activateTab).toHaveBeenCalledTimes(1)
  })
})
