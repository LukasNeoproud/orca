// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../../shared/backlog-task-association'

const state = vi.hoisted(() => ({
  activeWorkspaceExecutionHostId: 'local',
  getKnownWorktreeById: vi.fn(() => ({ displayName: 'Project' })),
  unifiedTabsByWorktree: {
    workspace: [
      {
        id: 'reused-tab',
        executionHostId: 'local',
        contentType: 'terminal',
        entityId: 'unrelated',
        label: 'Unrelated agent'
      }
    ]
  },
  tabsByWorktree: { workspace: [{ id: 'reused-tab', title: 'Unrelated terminal' }] }
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/lib/agent-catalog', () => ({
  getAgentCatalog: () => [{ id: 'claude', label: 'Claude' }]
}))
import { useBacklogAssociationContext } from './BacklogAssociationContext'

afterEach(cleanup)
describe('Backlog linked conversation identity', () => {
  it('does not replace saved terminal metadata with a reused tab title', () => {
    const association = {
      targetWorkspace: { workspaceId: 'workspace' },
      session: { title: 'Original task discussion', agent: 'claude' },
      terminal: { tabId: 'reused-tab' }
    } as BacklogTaskAssociation
    const view = renderHook(() => useBacklogAssociationContext(association))
    expect(view.result.current).toMatchObject({
      title: 'Original task discussion',
      agent: 'Claude',
      unavailable: false
    })
  })
  it('uses a renamed structured conversation only for the same session and host', () => {
    state.unifiedTabsByWorktree.workspace = [
      {
        id: 'tab',
        executionHostId: 'local',
        contentType: 'agent-session',
        entityId: 'session',
        label: 'Renamed conversation'
      }
    ]
    const association = {
      targetWorkspace: { workspaceId: 'workspace' },
      session: { title: 'Saved title', structuredSessionId: 'session' }
    } as BacklogTaskAssociation
    const view = renderHook(() => useBacklogAssociationContext(association))
    expect(view.result.current.title).toBe('Renamed conversation')
    state.unifiedTabsByWorktree.workspace[0]!.executionHostId = 'ssh:other'
    view.rerender()
    expect(view.result.current.title).toBe('Saved title')
  })
})
