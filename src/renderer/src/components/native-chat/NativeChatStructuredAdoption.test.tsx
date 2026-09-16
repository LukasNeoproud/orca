// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { getDefaultSettings } from '../../../../shared/constants'
import type { StructuredAgentSessionTerminalAdoptionResult } from '../../../../shared/structured-agent-session-terminal-adoption'

type FixtureState = Pick<
  AppState,
  'settings' | 'unifiedTabsByWorktree' | 'terminalLayoutsByTabId' | 'ptyIdsByTabId'
>
const mocks = vi.hoisted(() => ({
  state: {} as FixtureState,
  adopt: vi.fn(),
  handoff: vi.fn(),
  setState: vi.fn(),
  owner: 'local'
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (select: (state: AppState) => unknown) => select(mocks.state as AppState),
    { setState: mocks.setState }
  )
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => mocks.owner
}))
vi.mock('@/lib/adopt-structured-agent-terminal', () => ({
  adoptStructuredAgentTerminal: mocks.adopt,
  returnAdoptedTerminalToStructuredChat: mocks.handoff
}))
vi.mock('./NativeChatResolvedView', () => ({
  NativeChatResolvedView: () => <div data-testid="legacy">Legacy chat</div>
}))
vi.mock('./NativeChatEmptyState', () => ({
  NativeChatEmptyState: (props: { kind: string; message?: string }) => (
    <div>{props.message ?? props.kind}</div>
  )
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
import { NativeChatStructuredAdoption } from './NativeChatStructuredAdoption'

const props = {
  terminalTabId: 'terminal',
  paneKey: 'terminal:11111111-1111-4111-8111-111111111111',
  targetPtyId: 'pty',
  agent: 'codex' as const,
  sessionId: 'provider-thread',
  transcriptPath: null,
  isVisible: true,
  ownsTabWideLaunchDraft: true,
  terminalContext: { worktreeId: 'wt', unifiedTabId: 'unified', singlePane: true }
}
const adopted: StructuredAgentSessionTerminalAdoptionResult = {
  sessionId: 'codex_adopted',
  fence: 3,
  agent: 'codex'
}
function deferred() {
  let resolve!: (result: StructuredAgentSessionTerminalAdoptionResult) => void
  const promise = new Promise<StructuredAgentSessionTerminalAdoptionResult>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.owner = 'local'
  mocks.state = {
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
  mocks.setState.mockImplementation((update: (state: AppState) => Partial<AppState>) => {
    mocks.state = { ...mocks.state, ...update(mocks.state as AppState) }
  })
  mocks.adopt.mockResolvedValue(adopted)
  mocks.handoff.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('structured terminal adoption surface', () => {
  it('leaves the legacy path available while the structured flag is off', () => {
    mocks.state.settings!.experimentalStructuredNativeChat = false
    render(<NativeChatStructuredAdoption {...props} />)
    expect(screen.getByTestId('legacy')).toBeTruthy()
    expect(mocks.adopt).not.toHaveBeenCalled()
  })

  it('adopts the exact terminal despite Terminal default and binds the original pane before handoff', async () => {
    mocks.handoff.mockImplementation(async () => {
      expect(mocks.state.unifiedTabsByWorktree.wt[0]).toMatchObject({
        entityId: 'terminal',
        structuredSessionId: 'codex_adopted',
        structuredSessionPaneKey: 'terminal:11111111-1111-4111-8111-111111111111'
      })
    })
    render(<NativeChatStructuredAdoption {...props} />)
    expect(screen.queryByTestId('legacy')).toBeNull()
    await waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith(adopted))
    expect(mocks.adopt).toHaveBeenCalledWith({
      worktreeId: 'wt',
      agent: 'codex',
      providerSessionId: 'provider-thread',
      terminal: {
        tabId: 'terminal',
        paneKey: 'terminal:11111111-1111-4111-8111-111111111111',
        ptyId: 'pty'
      }
    })
    expect(mocks.state.settings!.openAgentTabsInChatByDefault).toBe(false)
  })

  it('asks the host to resolve a resumed conversation before any new hook reports its ID', async () => {
    render(<NativeChatStructuredAdoption {...props} sessionId={null} />)
    expect(screen.queryByTestId('legacy')).toBeNull()
    await waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith(adopted))
    expect(mocks.adopt).toHaveBeenCalledWith({
      worktreeId: 'wt',
      agent: 'codex',
      terminal: {
        tabId: 'terminal',
        paneKey: props.paneKey,
        ptyId: 'pty'
      }
    })
  })

  it('waits for a reconnected terminal without displaying the legacy model picker', async () => {
    const view = render(<NativeChatStructuredAdoption {...props} targetPtyId={null} />)
    expect(screen.getByText('loading')).toBeTruthy()
    expect(screen.queryByTestId('legacy')).toBeNull()
    expect(mocks.adopt).not.toHaveBeenCalled()
    view.rerender(<NativeChatStructuredAdoption {...props} />)
    await waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith(adopted))
  })

  it('binds only the current attempt when the resumed session ID arrives during adoption', async () => {
    const first = deferred()
    const current = deferred()
    mocks.adopt.mockReturnValueOnce(first.promise).mockReturnValueOnce(current.promise)
    const view = render(<NativeChatStructuredAdoption {...props} sessionId={null} />)
    view.rerender(<NativeChatStructuredAdoption {...props} />)
    expect(mocks.adopt).toHaveBeenCalledTimes(2)
    await act(async () => first.resolve(adopted))
    expect(mocks.state.unifiedTabsByWorktree.wt[0].structuredSessionId).toBeUndefined()
    expect(mocks.handoff).not.toHaveBeenCalled()
    await act(async () => current.resolve(adopted))
    expect(mocks.state.unifiedTabsByWorktree.wt[0].structuredSessionId).toBe(adopted.sessionId)
    expect(mocks.handoff).toHaveBeenCalledOnce()
  })

  it.each(['split', 'remote'])(
    'explains %s fallback without claiming structured ownership',
    (reason) => {
      mocks.owner = reason === 'remote' ? 'ssh:remote' : 'local'
      render(
        <NativeChatStructuredAdoption
          {...props}
          terminalContext={{ ...props.terminalContext, singlePane: reason !== 'split' }}
        />
      )
      expect(screen.getByRole('status').textContent).toMatch(/one pane|remote terminal/)
      expect(screen.getByTestId('legacy')).toBeTruthy()
      expect(mocks.adopt).not.toHaveBeenCalled()
    }
  )

  it('holds the legacy composer back after an unknown outcome and retries the same source', async () => {
    mocks.adopt.mockRejectedValueOnce(new Error('Adoption reply lost'))
    render(<NativeChatStructuredAdoption {...props} />)
    await screen.findByText('Adoption reply lost')
    expect(screen.queryByTestId('legacy')).toBeNull()
    expect(mocks.handoff).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.handoff).toHaveBeenCalledOnce())
    expect(mocks.adopt.mock.calls[1][0]).toEqual(mocks.adopt.mock.calls[0][0])
  })

  it('explains that an older running backend needs an Orca restart', async () => {
    mocks.adopt.mockRejectedValueOnce(
      Object.assign(new Error('Method missing'), { code: 'method_not_found' })
    )
    render(<NativeChatStructuredAdoption {...props} />)
    await screen.findByText('Restart Orca to enable structured chat for existing terminals.')
    expect(mocks.handoff).not.toHaveBeenCalled()
  })

  it.each(['unmount', 'setting-off', 'pane-replaced'])(
    'does not bind or stop the terminal after %s while adoption awaits',
    async (change) => {
      const pending = deferred()
      mocks.adopt.mockReturnValueOnce(pending.promise)
      const view = render(<NativeChatStructuredAdoption {...props} />)
      if (change === 'unmount') {
        view.unmount()
      }
      if (change === 'setting-off') {
        mocks.state.settings!.experimentalStructuredNativeChat = false
        view.rerender(<NativeChatStructuredAdoption {...props} />)
      }
      if (change === 'pane-replaced') {
        mocks.state.terminalLayoutsByTabId.terminal.ptyIdsByLeafId = {
          '11111111-1111-4111-8111-111111111111': 'replacement'
        }
      }
      await act(async () => {
        pending.resolve(adopted)
      })
      expect(mocks.state.unifiedTabsByWorktree.wt[0].structuredSessionId).toBeUndefined()
      expect(mocks.handoff).not.toHaveBeenCalled()
    }
  )
})
