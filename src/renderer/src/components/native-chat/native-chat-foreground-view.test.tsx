// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { PaneForegroundAgentEntry } from '../../store/slices/pane-foreground-agent'

const state = vi.hoisted(() => ({
  agentStatusByPaneKey: {} as Record<string, AgentStatusEntry>,
  paneForegroundAgentByPaneKey: {} as Record<string, PaneForegroundAgentEntry>
}))
vi.mock('../../store', () => ({
  useAppStore: (select: (value: typeof state) => unknown) => select(state)
}))
vi.mock('./NativeChatStructuredSession', () => ({ NativeChatStructuredSession: () => null }))
vi.mock('./NativeChatEmptyState', () => ({
  NativeChatEmptyState: () => <div>No conversation here</div>
}))
vi.mock('./NativeChatResolvedView', () => ({
  NativeChatResolvedView: (props: { agent: string; paneKey: string; sessionId: string | null }) => (
    <div data-testid="conversation">
      {props.agent}:{props.paneKey}:{props.sessionId ?? 'awaiting-session'}
    </div>
  )
}))
import NativeChatView from './NativeChatView'

const props = {
  terminalTabId: 'tab',
  paneKey: 'tab:manual',
  targetPtyId: 'pty-manual',
  isVisible: true,
  ownsTabWideLaunchDraft: false
}

afterEach(() => {
  cleanup()
  state.agentStatusByPaneKey = {}
  state.paneForegroundAgentByPaneKey = {}
})

describe('NativeChatView foreground identity', () => {
  it.each(['codex', 'claude'] as const)(
    'opens manual Codex without hook, launch, or title, then uses the reported %s session',
    (agentType) => {
      state.paneForegroundAgentByPaneKey = {
        'tab:manual': { agent: 'codex', shellForeground: false },
        'tab:sibling': { agent: 'opencode', shellForeground: false }
      }
      const view = render(<NativeChatView {...props} />)
      expect(screen.getByTestId('conversation').textContent).toBe(
        'codex:tab:manual:awaiting-session'
      )
      state.agentStatusByPaneKey = {
        'tab:manual': {
          paneKey: 'tab:manual',
          agentType,
          state: 'working',
          prompt: '',
          updatedAt: 1,
          stateStartedAt: 1,
          stateHistory: [],
          providerSession: { key: 'session_id', id: 'reported-session' }
        }
      }
      view.rerender(<NativeChatView {...props} />)
      expect(screen.getByTestId('conversation').textContent).toBe(
        `${agentType}:tab:manual:reported-session`
      )
      view.rerender(
        <NativeChatView
          {...props}
          paneKey="tab:sibling"
          launchAgent="codex"
          resolvedAgent="codex"
        />
      )
      expect(screen.queryByTestId('conversation')).toBeNull()
      expect(screen.getByText('No conversation here')).toBeTruthy()
    }
  )

  it('revokes cached supported identity when the same leaf detects an unsupported agent', () => {
    state.paneForegroundAgentByPaneKey = {
      'tab:manual': { agent: 'codex', shellForeground: false }
    }
    const view = render(<NativeChatView {...props} launchAgent="codex" resolvedAgent="codex" />)
    expect(screen.getByTestId('conversation')).toBeTruthy()
    state.paneForegroundAgentByPaneKey = {
      'tab:manual': { agent: 'opencode', shellForeground: false }
    }
    view.rerender(<NativeChatView {...props} launchAgent="codex" resolvedAgent="codex" />)
    expect(screen.queryByTestId('conversation')).toBeNull()
  })

  it.each([
    { agent: 'codex' as const, shellForeground: true },
    { agent: 'codex' as const, shellForeground: false, routingRevoked: true }
  ])('ignores invalid foreground evidence %j and supported siblings', (foreground) => {
    state.paneForegroundAgentByPaneKey = {
      'tab:manual': foreground,
      'tab:sibling': { agent: 'codex', shellForeground: false }
    }
    render(<NativeChatView {...props} />)
    expect(screen.queryByTestId('conversation')).toBeNull()
  })
})
