import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { getDefaultSettings } from '../../../shared/constants'
const owner = vi.hoisted(() => ({ current: 'local' }))
vi.mock('./worktree-runtime-owner', () => ({ getExecutionHostIdForWorktree: () => owner.current }))
import { bindStructuredAgentTerminal } from './bind-structured-agent-terminal'

const input = {
  worktreeId: 'wt',
  unifiedTabId: 'unified',
  agent: 'codex' as const,
  providerSessionId: 'thread',
  terminal: {
    tabId: 'terminal',
    paneKey: 'terminal:11111111-1111-4111-8111-111111111111',
    ptyId: 'pty'
  }
}
const adopted = { sessionId: 'codex_adopted', fence: 2, agent: 'codex' as const }
function fixture(): Pick<
  AppState,
  'settings' | 'unifiedTabsByWorktree' | 'terminalLayoutsByTabId' | 'ptyIdsByTabId'
> {
  return {
    settings: {
      ...getDefaultSettings('/tmp'),
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: false
    },
    unifiedTabsByWorktree: {
      wt: [
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
          viewMode: 'chat'
        }
      ]
    },
    terminalLayoutsByTabId: {
      terminal: {
        root: { type: 'leaf', leafId: '11111111-1111-4111-8111-111111111111' },
        activeLeafId: '11111111-1111-4111-8111-111111111111',
        expandedLeafId: null,
        ptyIdsByLeafId: { '11111111-1111-4111-8111-111111111111': 'pty' }
      }
    },
    ptyIdsByTabId: { terminal: ['pty'] }
  }
}

describe('terminal structured binding', () => {
  it('retains terminal identity and original pane scope without changing default view or bootstrap layout', () => {
    const state = fixture()
    const patch = bindStructuredAgentTerminal(state as AppState, input, adopted)
    expect(patch?.unifiedTabsByWorktree?.wt[0]).toEqual({
      ...state.unifiedTabsByWorktree.wt[0],
      structuredSessionId: adopted.sessionId,
      structuredSessionPaneKey: 'terminal:11111111-1111-4111-8111-111111111111',
      agentSessionAgent: 'codex'
    })
    expect(Object.keys(patch!)).toEqual(['unifiedTabsByWorktree'])
    expect(state.settings!.openAgentTabsInChatByDefault).toBe(false)
    expect(state.terminalLayoutsByTabId.terminal.ptyIdsByLeafId).toEqual({
      '11111111-1111-4111-8111-111111111111': 'pty'
    })
    expect(
      bindStructuredAgentTerminal({ ...state, ...patch } as AppState, input, adopted)
    ).toBeNull()
  })

  it.each(['flag-off', 'terminal-view', 'closed', 'replaced-pty', 'wrong-leaf', 'split'])(
    'rejects late binding after %s',
    (change) => {
      const state = fixture()
      if (change === 'flag-off') {
        state.settings!.experimentalStructuredNativeChat = false
      }
      if (change === 'terminal-view') {
        state.unifiedTabsByWorktree.wt[0].viewMode = 'terminal'
      }
      if (change === 'closed') {
        state.unifiedTabsByWorktree.wt = []
      }
      if (change === 'replaced-pty') {
        state.terminalLayoutsByTabId.terminal.ptyIdsByLeafId = {
          '11111111-1111-4111-8111-111111111111': 'new-pty'
        }
      }
      if (change === 'wrong-leaf') {
        state.terminalLayoutsByTabId.terminal.root = { type: 'leaf', leafId: 'replacement' }
      }
      if (change === 'split') {
        state.terminalLayoutsByTabId.terminal.root = {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', leafId: '11111111-1111-4111-8111-111111111111' },
          second: { type: 'leaf', leafId: 'sibling' }
        }
      }
      expect(bindStructuredAgentTerminal(state as AppState, input, adopted)).toBeNull()
    }
  )

  it('refuses changed remote ownership and wrong provider', () => {
    owner.current = 'ssh:remote'
    expect(bindStructuredAgentTerminal(fixture() as AppState, input, adopted)).toBeNull()
    owner.current = 'local'
    expect(
      bindStructuredAgentTerminal(fixture() as AppState, input, { ...adopted, agent: 'claude' })
    ).toBeNull()
  })
})
