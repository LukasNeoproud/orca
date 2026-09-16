// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { TerminalPaneController } from './use-terminal-pane-controller'

const mocks = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>()
}))

const LEAF_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
] as const

const store = {
  agentLaunchConfigByPaneKey: {},
  automaticAgentResumeClaimsByTabId: {
    'tab-1': { providerSession: { key: 'session_id', id: 'provider-1' } }
  },
  pendingStartupByTabId: {}
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof store) => unknown) => selector(store)
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local'
}))

vi.mock('./pane-agent-session-id', () => ({
  resolvePaneAgentSessionId: () => null
}))

vi.mock('../native-chat/NativeChatView', () => ({
  default: function NativeChatViewProbe(props: {
    paneKey?: string
    isVisible: boolean
    targetPtyId?: string | null
    terminalContext?: { knownProviderSession?: { id: string } }
  }) {
    const key = props.paneKey ?? 'structured'
    useEffect(() => {
      mocks.mounts.set(key, (mocks.mounts.get(key) ?? 0) + 1)
      return () => {
        mocks.unmounts.set(key, (mocks.unmounts.get(key) ?? 0) + 1)
      }
    }, [key])
    return (
      <span
        data-chat-pane={key}
        data-chat-visible={String(props.isVisible)}
        data-chat-pty={props.targetPtyId ?? ''}
        data-chat-provider={props.terminalContext?.knownProviderSession?.id ?? ''}
      />
    )
  }
}))

import { TerminalPaneNativeChatPortal } from './TerminalPaneNativeChatPortal'

function pane(id: number): ManagedPane {
  return {
    id,
    leafId: LEAF_IDS[id - 1] as ManagedPane['leafId'],
    stablePaneId: LEAF_IDS[id - 1] as ManagedPane['stablePaneId'],
    container: document.createElement('div'),
    linkTooltip: document.createElement('div'),
    terminal: {} as ManagedPane['terminal'],
    fitAddon: {} as ManagedPane['fitAddon'],
    searchAddon: {} as ManagedPane['searchAddon'],
    serializeAddon: {} as ManagedPane['serializeAddon']
  }
}

function controller(activeLeafId: string): TerminalPaneController {
  const panes = [pane(1), pane(2)]
  for (const entry of panes) {
    document.body.appendChild(entry.container)
  }
  const noop = vi.fn()
  return {
    chatLeafId: activeLeafId as ManagedPane['leafId'],
    contextMenu: {
      runForPane: (_id: number, action: () => void) => action(),
      onSplitRight: noop,
      onSplitDown: noop,
      onEqualizePaneSizes: noop,
      onToggleExpand: noop,
      onContinueAgentSessionInNewSession: noop,
      onForkAgentSession: noop,
      onSetTitle: noop,
      onCopyTerminalId: noop,
      onCopyPaneId: noop,
      onCopyAgentSessionId: noop,
      onClosePane: noop
    },
    effectiveChatViewMode: true,
    expandedPaneId: null,
    isRendererVisible: true,
    managedPanes: panes,
    readNativeChatTerminalScreen: () => null,
    resolveAgentForLeaf: () => 'codex',
    structuredChatTarget: { kind: 'local' },
    switchNativeChatToTerminal: noop,
    tabId: 'tab-1',
    unifiedTabId: 'tab-1',
    worktreeId: 'wt-1',
    retainedChatPaneProjections: panes.map((entry) => ({
      pane: entry,
      ptyId: `pty-${entry.id}`,
      resolvedAgent: 'codex',
      launchAgent: 'codex',
      ownsTabWideLaunchDraft: entry.id === 1,
      structuredSessionId: null,
      structuredSessionAgent: undefined
    }))
  } as unknown as TerminalPaneController
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  mocks.mounts.clear()
  mocks.unmounts.clear()
})

describe('TerminalPaneNativeChatPortal', () => {
  it('keeps visited split chats mounted while visibility moves between stable panes', () => {
    const first = controller(LEAF_IDS[0])
    const view = render(<TerminalPaneNativeChatPortal controller={first} />)
    const firstPane = document.querySelector<HTMLElement>(
      `[data-chat-pane="tab-1:${LEAF_IDS[0]}"]`
    )!
    const secondPane = document.querySelector<HTMLElement>(
      `[data-chat-pane="tab-1:${LEAF_IDS[1]}"]`
    )!

    expect(firstPane.dataset.chatVisible).toBe('true')
    expect(secondPane.dataset.chatVisible).toBe('false')
    expect(firstPane.dataset.chatPty).toBe('pty-1')
    expect(firstPane.dataset.chatProvider).toBe('provider-1')
    expect(secondPane.dataset.chatProvider).toBe('')

    const second = { ...first, chatLeafId: LEAF_IDS[1] } as TerminalPaneController
    view.rerender(<TerminalPaneNativeChatPortal controller={second} />)

    expect(firstPane.dataset.chatVisible).toBe('false')
    expect(secondPane.dataset.chatVisible).toBe('true')
    expect(mocks.mounts).toEqual(
      new Map([
        [`tab-1:${LEAF_IDS[0]}`, 1],
        [`tab-1:${LEAF_IDS[1]}`, 1]
      ])
    )
    expect(mocks.unmounts.size).toBe(0)
  })
})
