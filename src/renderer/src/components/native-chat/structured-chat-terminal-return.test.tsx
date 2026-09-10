// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import type { AgentSessionHandoffStatus } from '../../../../shared/agent-session-wire'
const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  state: {
    settings: { experimentalNativeChat: true },
    activeGroupIdByWorktree: { wt: 'group' },
    groupsByWorktree: { wt: [{ id: 'group', activeTabId: 'unified' }] },
    unifiedTabsByWorktree: { wt: [] as Tab[] },
    terminalLayoutsByTabId: {} as Record<string, TerminalLayoutSnapshot>,
    tabsByWorktree: {},
    agentStatusByPaneKey: {},
    paneForegroundAgentByPaneKey: {},
    toggleTabViewMode: (...args: unknown[]) => mocks.toggle(...args)
  }
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
import { useNativeChatToggleShortcut } from './use-native-chat-toggle-shortcut'
import { canSwitchNativeChatView } from './native-chat-availability'
import { useTerminalChatToggleAvailability } from '../terminal-pane/use-terminal-chat-toggle-availability'
import { useStructuredTerminalReturnPanes } from '../tab-bar/use-structured-terminal-return-panes'
import { canShowAdoptedTerminal } from './structured-agent-session-terminal-escape'
import { StructuredAgentSessionHandoffChrome } from './StructuredAgentSessionHandoffChrome'
const leaf = '11111111-1111-4111-8111-111111111111'
const sibling = '22222222-2222-4222-8222-222222222222'
const paneKey = `terminal:${leaf}`
const tui: AgentSessionHandoffStatus = {
  owner: 'tui',
  phase: 'queued',
  direction: 'to-native',
  stage: null,
  operationId: 'operation',
  terminal: { tabId: 'terminal', paneKey, handle: 'handle' }
}
beforeEach(() => {
  mocks.toggle.mockClear()
  mocks.state.settings.experimentalNativeChat = true
  mocks.state.unifiedTabsByWorktree.wt = [
    {
      id: 'unified',
      entityId: 'terminal',
      worktreeId: 'wt',
      groupId: 'group',
      contentType: 'terminal',
      label: 'Shell',
      customLabel: null,
      color: null,
      sortOrder: 0,
      createdAt: 0,
      viewMode: 'terminal',
      structuredSessionId: 'session',
      structuredSessionPaneKey: paneKey
    }
  ]
  mocks.state.terminalLayoutsByTabId = {
    terminal: { root: { type: 'leaf', leafId: leaf }, activeLeafId: leaf, expandedLeafId: null }
  }
})
afterEach(cleanup)

function chord() {
  const mac = navigator.userAgent.includes('Mac')
  fireEvent.keyDown(window, { key: 'j', shiftKey: true, metaKey: mac, ctrlKey: !mac })
}

describe('adopted terminal escape and return', () => {
  it('shows the original queued TUI without cancelling or requesting another handoff', () => {
    const show = vi.fn()
    const request = vi.fn()
    render(
      <StructuredAgentSessionHandoffChrome
        status={tui}
        isWorking
        onShowTerminal={canShowAdoptedTerminal(tui, paneKey) ? show : undefined}
        onRequest={request}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show terminal' }))
    expect(show).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
  })

  it('only permits escape for the original TUI in usable or recoverable phases', () => {
    expect(canShowAdoptedTerminal({ ...tui, phase: 'idle' }, paneKey)).toBe(true)
    expect(
      canShowAdoptedTerminal(
        { ...tui, phase: 'failed', error: { message: 'Retry', recoverableOwner: 'tui' } },
        paneKey
      )
    ).toBe(true)
    expect(
      canShowAdoptedTerminal(
        { ...tui, phase: 'failed', error: { message: 'Lost', recoverableOwner: 'none' } },
        paneKey
      )
    ).toBe(false)
    expect(canShowAdoptedTerminal({ ...tui, owner: 'native' }, paneKey)).toBe(false)
    expect(canShowAdoptedTerminal({ ...tui, phase: 'switching' }, paneKey)).toBe(false)
    expect(
      canShowAdoptedTerminal(
        { ...tui, terminal: { ...tui.terminal!, paneKey: `other:${leaf}` } },
        paneKey
      )
    ).toBe(false)
    expect(canShowAdoptedTerminal(tui, undefined)).toBe(false)
  })

  it('returns via keyboard with no live agent hints and never toggles native chat to a shell', () => {
    renderHook(() => useNativeChatToggleShortcut('wt', true))
    chord()
    expect(mocks.toggle).toHaveBeenCalledWith('unified')
    mocks.toggle.mockClear()
    mocks.state.unifiedTabsByWorktree.wt[0].viewMode = 'chat'
    chord()
    expect(mocks.toggle).not.toHaveBeenCalled()
    mocks.state.unifiedTabsByWorktree.wt[0].viewMode = 'terminal'
    mocks.state.terminalLayoutsByTabId.terminal = {
      root: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', leafId: leaf },
        second: { type: 'leaf', leafId: sibling }
      },
      activeLeafId: sibling,
      expandedLeafId: null
    }
    chord()
    expect(mocks.toggle).not.toHaveBeenCalled()
  })

  it('makes header return available only for the bound leaf without agent hints', () => {
    const input = {
      chatLeafId: null as string | null,
      effectiveChatViewMode: false,
      isChatEligibleForLeaf: () => false,
      nativeChatEnabled: true,
      tabStructuredSessionId: 'session',
      structuredSessionLeafId: leaf,
      structuredSessionPaneKey: paneKey,
      tabId: 'terminal'
    }
    const { result, rerender } = renderHook((args) => useTerminalChatToggleAvailability(args), {
      initialProps: input
    })
    expect(result.current(leaf)).toBe(true)
    expect(result.current(sibling)).toBe(false)
    rerender({ ...input, chatLeafId: leaf, effectiveChatViewMode: true })
    expect(result.current(leaf)).toBe(false)
  })

  it('projects the active pane for tab-menu return and rejects sibling or absent layout evidence', () => {
    const { result, rerender } = renderHook(() =>
      useStructuredTerminalReturnPanes(mocks.state.unifiedTabsByWorktree.wt)
    )
    const allowed = () =>
      canSwitchNativeChatView({
        experimentalNativeChatEnabled: true,
        contentType: 'terminal',
        structuredSessionId: 'session',
        structuredSessionPaneKey: paneKey,
        activePaneKey: result.current.terminal
      })
    expect(allowed()).toBe(true)
    act(() => {
      mocks.state.terminalLayoutsByTabId.terminal.activeLeafId = sibling
      rerender()
    })
    expect(allowed()).toBe(false)
    act(() => {
      mocks.state.terminalLayoutsByTabId = {}
      rerender()
    })
    expect(allowed()).toBe(false)
  })
})
