import { describe, expect, it } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { PtyManagementSession } from '../../../../preload/api/pty-management-api'
import {
  buildManagerRows,
  filterManagerRows,
  sessionSelectionKey,
  type ManagerContext
} from './agent-manager-model'

function session(overrides: Partial<PtyManagementSession> = {}): PtyManagementSession {
  return {
    sessionId: 'repo::/tmp/worktree@@session',
    incarnationId: 'inc-1',
    state: 'running',
    shellState: 'ready',
    isAlive: true,
    pid: 123,
    cwd: '/tmp/worktree',
    cols: 80,
    rows: 24,
    createdAt: 0,
    protocolVersion: 30,
    ...overrides
  }
}

function context(overrides: Partial<ManagerContext> = {}): ManagerContext {
  return {
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    workspaceSessionReady: true,
    repos: [],
    worktreesByRepo: {},
    agentStatusByPaneKey: {},
    runtimePaneTitlesByTabId: {},
    lastTerminalInputAtByPaneKey: {},
    memorySnapshot: null,
    ...overrides
  } as ManagerContext
}

describe('agent manager model', () => {
  it('keeps daemon-proven pane bindings out of the orphan set', () => {
    const [row] = buildManagerRows(
      [session({ agentOwnership: 'absent', paneBound: true })],
      context()
    )

    expect(row.binding).toBe('bound')
    expect(filterManagerRows([row], '', 'orphan', 'all')).toEqual([])
  })

  it('uses explicit daemon workspace metadata for independent sessions', () => {
    const [row] = buildManagerRows(
      [
        session({
          sessionId: `${FLOATING_TERMINAL_WORKTREE_ID}@@session`,
          worktreeId: FLOATING_TERMINAL_WORKTREE_ID
        })
      ],
      context()
    )

    expect(row.independent).toBe(true)
    expect(row.projectId).toBeNull()
    expect(filterManagerRows([row], '', 'independent', 'all')).toEqual([row])
  })

  it('requires authoritative absence and completed workspace restore before calling a row orphaned', () => {
    const unknown = buildManagerRows([session({ agentOwnership: 'unknown' })], context())[0]
    const restoring = buildManagerRows(
      [session({ agentOwnership: 'absent' })],
      context({ workspaceSessionReady: false })
    )[0]
    const orphan = buildManagerRows([session({ agentOwnership: 'absent' })], context())[0]

    expect(unknown.binding).toBe('unknown')
    expect(restoring.binding).toBe('unknown')
    expect(orphan.binding).toBe('orphan')
  })

  it('does not invent timestamps and fences selection by incarnation', () => {
    const [unknownTimes, knownTimes] = buildManagerRows(
      [session(), session({ sessionId: 'second', incarnationId: 'inc-2', createdAt: 100 })],
      context()
    )

    expect(unknownTimes.createdAt).toBeNull()
    expect(unknownTimes.lastUsedAt).toBeNull()
    expect(knownTimes.createdAt).toBe(100)
    expect(sessionSelectionKey(session({ incarnationId: 'old' }))).not.toBe(
      sessionSelectionKey(session({ incarnationId: 'replacement' }))
    )
  })

  it('protects restored inactive tabs before their panes reattach', () => {
    const retained = session({ agentOwnership: 'absent' })
    const tab = {
      id: 'restored-tab',
      ptyId: retained.sessionId,
      title: 'Restored',
      worktreeId: 'repo::/tmp/worktree'
    }
    const [row] = buildManagerRows(
      [retained],
      context({
        tabsByWorktree: {
          'repo::/tmp/worktree': [tab as ManagerContext['tabsByWorktree'][string][number]]
        }
      })
    )
    expect(row.binding).toBe('bound')
    expect(row.tabId).toBe('restored-tab')
  })

  it('maps input to the matching split pane and excludes stale input from an earlier process', () => {
    const leaf = '11111111-1111-4111-8111-111111111111'
    const paneKey = `split-tab:${leaf}`
    const retained = session({ createdAt: 2_000 })
    const tab = { id: 'split-tab', ptyId: null, title: 'Split', worktreeId: 'repo::/tmp/worktree' }
    const ctx = context({
      tabsByWorktree: {
        'repo::/tmp/worktree': [tab as ManagerContext['tabsByWorktree'][string][number]]
      },
      terminalLayoutsByTabId: {
        'split-tab': {
          root: { type: 'leaf', leafId: leaf },
          activeLeafId: leaf,
          expandedLeafId: null,
          ptyIdsByLeafId: { [leaf]: retained.sessionId }
        }
      },
      lastTerminalInputAtByPaneKey: { [paneKey]: 3_000 }
    })
    expect(buildManagerRows([retained], ctx)[0]).toMatchObject({
      paneKey,
      lastUsedAt: 3_000,
      binding: 'bound'
    })
    expect(buildManagerRows([{ ...retained, createdAt: 4_000 }], ctx)[0].lastUsedAt).toBeNull()
    expect(buildManagerRows([], ctx)).toEqual([])
  })
})
