import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store'
import type { Tab } from '../../../../shared/tab-types'
import type * as StructuredDisposal from '../terminal/structured-terminal-session-disposal'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  setState: vi.fn(),
  close: vi.fn(),
  environment: vi.fn((): string | null => null),
  executionHost: vi.fn(() => 'local'),
  error: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState, setState: mocks.setState } }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: mocks.executionHost,
  getRuntimeEnvironmentIdForWorktree: mocks.environment
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('../terminal/structured-terminal-session-disposal', async (importOriginal) => ({
  ...(await importOriginal<typeof StructuredDisposal>()),
  closeStructuredTerminalSessionWithRetry: mocks.close
}))

import { requestStructuredTerminalPaneClose } from './structured-terminal-pane-close'

const WORKSPACE = 'folder:workspace-1'
const TAB_ID = 'terminal-1'
const PANE_KEY = `${TAB_ID}:11111111-1111-4111-8111-111111111111`
const OTHER_PANE_KEY = `${TAB_ID}:22222222-2222-4222-8222-222222222222`
type CloseState = Pick<AppState, 'unifiedTabsByWorktree'>
let state: CloseState

function adoptedTab(): Tab {
  return {
    id: 'unified-1',
    entityId: TAB_ID,
    contentType: 'terminal',
    worktreeId: WORKSPACE,
    label: 'My conversation',
    viewMode: 'chat',
    structuredSessionId: 'codex-session-1',
    structuredSessionPaneKey: PANE_KEY,
    agentSessionAgent: 'codex'
  } as Tab
}

function closeInput() {
  return {
    worktreeId: WORKSPACE,
    tabId: TAB_ID,
    paneKey: PANE_KEY,
    isPaneCurrent: vi.fn(() => true),
    onClosed: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.environment.mockReturnValue(null)
  mocks.executionHost.mockReturnValue('local')
  mocks.close.mockResolvedValue(true)
  state = { unifiedTabsByWorktree: { [WORKSPACE]: [adoptedTab()] } }
  mocks.getState.mockImplementation(() => state)
  mocks.setState.mockImplementation((updater: (current: CloseState) => Partial<CloseState>) => {
    state = { ...state, ...updater(state) }
  })
})

describe('adopted terminal pane close', () => {
  it('waits for host close before clearing the binding and removing only the requested pane', async () => {
    let finish!: (closed: boolean) => void
    mocks.close.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const sibling = { ...adoptedTab(), id: 'other', entityId: 'other-terminal' }
    state.unifiedTabsByWorktree[WORKSPACE].push(sibling)
    const input = closeInput()

    expect(requestStructuredTerminalPaneClose(input)).toBe(true)
    expect(mocks.close).toHaveBeenCalledWith({ kind: 'local' }, 'codex-session-1')
    expect(input.onClosed).not.toHaveBeenCalled()
    expect(state.unifiedTabsByWorktree[WORKSPACE][0].structuredSessionId).toBe('codex-session-1')
    finish(true)

    await vi.waitFor(() => expect(input.onClosed).toHaveBeenCalledOnce())
    expect(state.unifiedTabsByWorktree[WORKSPACE][0]).toEqual({
      id: 'unified-1',
      entityId: TAB_ID,
      contentType: 'terminal',
      worktreeId: WORKSPACE,
      label: 'My conversation',
      viewMode: 'terminal'
    })
    expect(state.unifiedTabsByWorktree[WORKSPACE][1]).toBe(sibling)
  })

  it('leaves a sibling pane on the existing close path', () => {
    const input = { ...closeInput(), paneKey: OTHER_PANE_KEY }
    expect(requestStructuredTerminalPaneClose(input)).toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.setState).not.toHaveBeenCalled()
  })

  it('deduplicates repeated close requests while the provider close is pending', async () => {
    let finish!: (closed: boolean) => void
    mocks.close.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const input = closeInput()
    const duplicate = closeInput()
    requestStructuredTerminalPaneClose(input)
    requestStructuredTerminalPaneClose(duplicate)
    expect(mocks.close).toHaveBeenCalledOnce()
    finish(true)
    await vi.waitFor(() => expect(input.onClosed).toHaveBeenCalledOnce())
    expect(duplicate.onClosed).not.toHaveBeenCalled()
  })

  it('keeps the binding and pane available when close cannot be verified', async () => {
    mocks.close.mockResolvedValue(false)
    const input = closeInput()
    requestStructuredTerminalPaneClose(input)
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(input.onClosed).not.toHaveBeenCalled()
    expect(state.unifiedTabsByWorktree[WORKSPACE][0]).toEqual(adoptedTab())
  })

  it.each(['pane-replaced', 'new-session', 'tab-removed'])(
    'does not remove a successor after a late close reply: %s',
    async (change) => {
      let finish!: (closed: boolean) => void
      mocks.close.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
      const input = closeInput()
      requestStructuredTerminalPaneClose(input)
      if (change === 'pane-replaced') {
        input.isPaneCurrent.mockReturnValue(false)
      }
      if (change === 'new-session') {
        state.unifiedTabsByWorktree[WORKSPACE][0].structuredSessionId = 'codex-session-2'
      }
      if (change === 'tab-removed') {
        state.unifiedTabsByWorktree[WORKSPACE] = []
      }
      const tabs = state.unifiedTabsByWorktree[WORKSPACE]
      finish(true)
      await vi.waitFor(() => expect(mocks.setState).toHaveBeenCalledOnce())
      expect(input.onClosed).not.toHaveBeenCalled()
      expect(state.unifiedTabsByWorktree[WORKSPACE]).toBe(tabs)
    }
  )

  it('routes a paired folder workspace close to its execution host', async () => {
    mocks.environment.mockReturnValue('host-1')
    mocks.executionHost.mockReturnValue('runtime:host-1')
    const input = closeInput()
    requestStructuredTerminalPaneClose(input)
    await vi.waitFor(() => expect(input.onClosed).toHaveBeenCalledOnce())
    expect(mocks.close).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'host-1' },
      'codex-session-1'
    )
  })

  it('retains a session with an unresolved or direct SSH owner', async () => {
    mocks.executionHost.mockReturnValue('ssh:connection-1')
    const input = closeInput()
    requestStructuredTerminalPaneClose(input)
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.close).not.toHaveBeenCalled()
    expect(input.onClosed).not.toHaveBeenCalled()
    expect(state.unifiedTabsByWorktree[WORKSPACE][0]).toEqual(adoptedTab())
  })
})
