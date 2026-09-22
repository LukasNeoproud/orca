import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  state: {
    agentStatusByPaneKey: {} as Record<
      string,
      { agentType: string; worktreeId: string; providerSession: { id: string } }
    >,
    terminalLayoutsByTabId: {} as Record<string, { ptyIdsByLeafId: Record<string, string> }>
  }
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.state,
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener)
      return () => mocks.listeners.delete(listener)
    }
  }
}))
import { waitForTerminalProviderSession } from './terminal-provider-session-identity'
const leaf = '00000000-0000-4000-8000-000000000001'
const pane = `tab:${leaf}`
const expected = { agent: 'claude' as const, workspaceId: 'workspace', ptyId: 'new-pty' }
describe('launched terminal provider identity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.listeners.clear()
    mocks.state.agentStatusByPaneKey = {
      [pane]: {
        agentType: 'claude',
        worktreeId: 'workspace',
        providerSession: { id: 'old-provider' }
      }
    }
    mocks.state.terminalLayoutsByTabId = { tab: { ptyIdsByLeafId: { [leaf]: 'old-pty' } } }
  })
  afterEach(() => vi.useRealTimers())
  it('waits for identity from the launched PTY rather than a reused pane', async () => {
    const result = waitForTerminalProviderSession(pane, 1000, expected)
    expect(mocks.listeners.size).toBe(1)
    mocks.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leaf] = 'new-pty'
    mocks.state.agentStatusByPaneKey[pane].providerSession.id = 'new-provider'
    mocks.listeners.forEach((listener) => listener())
    expect(await result).toEqual({ id: 'new-provider' })
    expect(mocks.listeners.size).toBe(0)
  })
  it('does not persist another agent or workspace identity when the wait expires', async () => {
    mocks.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leaf] = 'new-pty'
    mocks.state.agentStatusByPaneKey[pane].worktreeId = 'other-workspace'
    const result = waitForTerminalProviderSession(pane, 1000, expected)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBeUndefined()
    expect(mocks.listeners.size).toBe(0)
  })
})
