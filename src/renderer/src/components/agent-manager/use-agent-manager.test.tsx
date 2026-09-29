// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtyManagementSession } from '../../../../preload/api/pty-management-api'
import { buildManagerRows, type ManagerContext, type ManagerRow } from './agent-manager-model'

const mocks = vi.hoisted(() => {
  const state = {
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
    fetchMemorySnapshot: vi.fn(async () => {})
  }
  return {
    state,
    listSessions: vi.fn(),
    killOne: vi.fn(),
    broadListSessions: vi.fn(),
    invalidationListeners: new Set<() => void>()
  }
})

vi.mock('../../store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))

vi.mock('../status-bar/daemon-session-inventory-invalidation', () => ({
  subscribeDaemonSessionInventoryInvalidated: (listener: () => void) => {
    mocks.invalidationListeners.add(listener)
    return () => mocks.invalidationListeners.delete(listener)
  },
  notifyDaemonSessionInventoryInvalidated: () => {
    for (const listener of mocks.invalidationListeners) {
      listener()
    }
  }
}))

import { useAgentManager } from './use-agent-manager'

function session(id: string, overrides: Partial<PtyManagementSession> = {}): PtyManagementSession {
  return {
    sessionId: id,
    incarnationId: `inc-${id}`,
    state: 'running',
    shellState: 'ready',
    isAlive: true,
    pid: 123,
    cwd: `/tmp/${id}`,
    cols: 80,
    rows: 24,
    createdAt: 0,
    protocolVersion: 30,
    agentOwnership: 'unknown',
    ...overrides
  }
}

function inventory(
  sessions: PtyManagementSession[],
  inventoryStatus: 'complete' | 'unverifiable' = 'complete'
) {
  return { sessions, inventoryStatus, degraded: false }
}

function rowFor(target: PtyManagementSession): ManagerRow {
  return buildManagerRows([target], mocks.state as unknown as ManagerContext)[0]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('useAgentManager', () => {
  beforeEach(() => {
    mocks.listSessions.mockReset()
    mocks.killOne.mockReset()
    mocks.broadListSessions.mockReset()
    mocks.invalidationListeners.clear()
    mocks.state.fetchMemorySnapshot.mockClear()
    mocks.listSessions.mockResolvedValue(inventory([]))
    mocks.killOne.mockResolvedValue({ success: true, status: 'exited' })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        pty: {
          listSessions: mocks.broadListSessions,
          management: { listSessions: mocks.listSessions, killOne: mocks.killOne },
          onSpawned: vi.fn(() => vi.fn()),
          onExit: vi.fn(() => vi.fn())
        }
      }
    })
  })

  afterEach(() => cleanup())

  it('lists only the local management inventory and retains rows when it is incomplete', async () => {
    const first = session('first')
    const partial = session('partial')
    mocks.listSessions
      .mockResolvedValueOnce(inventory([first]))
      .mockResolvedValueOnce(inventory([partial], 'unverifiable'))
    const hook = renderHook(() => useAgentManager())
    await waitFor(() =>
      expect(hook.result.current.rows.map((row) => row.session.sessionId)).toEqual(['first'])
    )

    await act(async () => hook.result.current.refresh())

    expect(hook.result.current.incomplete).toBe(true)
    expect(hook.result.current.rows.map((row) => row.session.sessionId)).toEqual([
      'first',
      'partial'
    ])
    expect(mocks.broadListSessions).not.toHaveBeenCalled()
  })

  it('passes incarnation fences and exposes verified and unverifiable outcomes', async () => {
    const exited = session('exited')
    const uncertain = session('uncertain')
    mocks.listSessions.mockResolvedValueOnce(inventory([exited, uncertain]))
    mocks.killOne
      .mockResolvedValueOnce({ success: true, status: 'exited' })
      .mockRejectedValueOnce(new Error('daemon disconnected'))
    const hook = renderHook(() => useAgentManager())
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(2))
    const targets = hook.result.current.rows

    await act(async () => hook.result.current.terminate(targets))

    expect(mocks.killOne).toHaveBeenNthCalledWith(1, {
      sessionId: exited.sessionId,
      incarnationId: exited.incarnationId
    })
    expect(mocks.killOne).toHaveBeenNthCalledWith(2, {
      sessionId: uncertain.sessionId,
      incarnationId: uncertain.incarnationId
    })
    expect(hook.result.current.results.map(({ status }) => status)).toEqual([
      'exited',
      'unverifiable'
    ])
  })

  it('drains a refresh queued behind an in-flight stale inventory after termination', async () => {
    const stale = session('stale')
    const fresh = session('fresh')
    const firstInventory = deferred<ReturnType<typeof inventory>>()
    mocks.listSessions
      .mockReturnValueOnce(firstInventory.promise)
      .mockResolvedValueOnce(inventory([fresh]))
    const hook = renderHook(() => useAgentManager())
    await waitFor(() => expect(mocks.listSessions).toHaveBeenCalledTimes(1))

    await act(async () => hook.result.current.terminate([rowFor(stale)]))
    await act(async () => firstInventory.resolve(inventory([stale])))

    await waitFor(() => {
      expect(mocks.listSessions).toHaveBeenCalledTimes(2)
      expect(hook.result.current.rows.map((row) => row.session.sessionId)).toEqual(['fresh'])
    })
  })
})
