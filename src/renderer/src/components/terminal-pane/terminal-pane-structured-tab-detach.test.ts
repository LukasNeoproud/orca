import { describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import {
  detachTerminalPaneToTab,
  type TerminalPaneTabDetachStore
} from './terminal-pane-tab-detach'

const WORKTREE = 'worktree-1'
const TAB = 'terminal-1'
const OWNER = '11111111-1111-4111-8111-111111111111'
const SIBLING = '22222222-2222-4222-8222-222222222222'

function fixture() {
  const store = {
    groupsByWorktree: { [WORKTREE]: [{ id: 'target-group', tabOrder: [] }] },
    terminalLayoutsByTabId: {
      [TAB]: {
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: OWNER },
          second: { type: 'leaf', leafId: SIBLING }
        },
        activeLeafId: OWNER,
        expandedLeafId: null,
        ptyIdsByLeafId: { [OWNER]: 'owner-shell', [SIBLING]: 'sibling-shell' }
      }
    },
    unifiedTabsByWorktree: { [WORKTREE]: [] as Tab[] },
    tabsByWorktree: { [WORKTREE]: [{ id: TAB }] },
    createTab: vi.fn(() => ({ id: 'detached-tab' })),
    reorderUnifiedTabs: vi.fn(),
    setActiveTab: vi.fn(),
    setActiveTabType: vi.fn(),
    setTabLayout: vi.fn(),
    syncPaneDetachPtyOwnership: vi.fn()
  } as unknown as TerminalPaneTabDetachStore
  const bind = () => {
    store.unifiedTabsByWorktree[WORKTREE] = [
      {
        contentType: 'terminal',
        entityId: TAB,
        viewMode: 'terminal',
        structuredSessionId: 'session-1',
        structuredSessionPaneKey: `${TAB}:${OWNER}`
      } as Tab
    ]
  }
  const manager = {
    getPanes: () => [{ id: 1 }, { id: 2 }],
    getLeafId: (id: number) => (id === 1 ? OWNER : SIBLING),
    detachPaneForExternalMove: vi.fn(() => true)
  }
  const input = {
    getStore: () => store,
    manager,
    persistLayoutSnapshot: vi.fn(),
    sourcePaneId: 1,
    sourceTabId: TAB,
    targetGroupId: 'target-group',
    worktreeId: WORKTREE
  }
  return { store, manager, input, bind }
}

describe('detaching a terminal pane with a structured owner', () => {
  it('refuses detaching the adopted leaf before any state mutation', () => {
    const { store, manager, input, bind } = fixture()
    bind()
    expect(detachTerminalPaneToTab(input)).toBeNull()
    expect(input.persistLayoutSnapshot).not.toHaveBeenCalled()
    expect(manager.detachPaneForExternalMove).not.toHaveBeenCalled()
    expect(store.createTab).not.toHaveBeenCalled()
    expect(store.syncPaneDetachPtyOwnership).not.toHaveBeenCalled()
  })

  it('allows detaching a sibling without transferring the structured owner', () => {
    const { store, manager, input, bind } = fixture()
    bind()
    const binding = store.unifiedTabsByWorktree[WORKTREE]
    expect(detachTerminalPaneToTab({ ...input, sourcePaneId: 2 })?.leafId).toBe(SIBLING)
    expect(manager.detachPaneForExternalMove).toHaveBeenCalledWith(2)
    expect(store.unifiedTabsByWorktree[WORKTREE]).toBe(binding)
    expect(store.createTab).toHaveBeenCalledOnce()
  })

  it('rechecks ownership after the layout snapshot publishes', () => {
    const { store, manager, input, bind } = fixture()
    input.persistLayoutSnapshot.mockImplementation(bind)
    expect(detachTerminalPaneToTab(input)).toBeNull()
    expect(manager.detachPaneForExternalMove).not.toHaveBeenCalled()
    expect(store.createTab).not.toHaveBeenCalled()
  })
})
