// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerRow } from './agent-manager-model'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  terminate: vi.fn(async () => {}),
  refresh: vi.fn(),
  rows: [] as ManagerRow[],
  incomplete: false
}))
vi.mock('./use-agent-manager', () => ({
  useAgentManager: () => ({
    rows: mocks.rows,
    loading: false,
    error: false,
    incomplete: mocks.incomplete,
    degraded: false,
    busy: false,
    results: [],
    refresh: mocks.refresh,
    terminate: mocks.terminate
  })
}))
vi.mock('../../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ closeAgentManager: mocks.close })
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('./AgentManagerPreview', () => ({
  AgentManagerPreview: ({ children }: { children: React.ReactNode }) => children
}))

import AgentManagerPage from './AgentManagerPage'
import { TooltipProvider } from '@/components/ui/tooltip'

function row(id: string, independent = false): ManagerRow {
  return {
    key: id,
    label: id,
    provider: 'codex',
    state: 'working',
    binding: 'bound',
    independent,
    projectId: independent ? null : 'orca',
    projectName: independent ? null : 'Orca',
    workspaceName: 'Workspace',
    tabId: null,
    paneKey: null,
    createdAt: null,
    lastUsedAt: null,
    cpu: null,
    memory: null,
    session: {
      sessionId: id,
      state: 'running',
      shellState: 'ready',
      isAlive: true,
      pid: 12,
      cwd: `/projects/${id}`,
      cols: 80,
      rows: 24,
      createdAt: 0,
      protocolVersion: 1
    }
  }
}
function renderPage() {
  return render(
    <TooltipProvider>
      <AgentManagerPage />
    </TooltipProvider>
  )
}

describe('AgentManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows = [row('Project agent'), row('Independent agent', true)]
    mocks.incomplete = false
  })
  afterEach(cleanup)

  it('shows working directories and unknown dates without fabricating idle state', () => {
    renderPage()
    expect(screen.getByText('Working directory')).toBeTruthy()
    expect(screen.getByText('/projects/Project agent')).toBeTruthy()
    expect(screen.getAllByText('Unknown')).toHaveLength(4)
    expect(screen.getAllByText('Working')).toHaveLength(3)
  })

  it('only ends filtered selection after explicit confirmation', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Independent' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all filtered terminals' }))
    expect(mocks.terminate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'End selected…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Independent agent')).toBeTruthy()
    expect(within(dialog).queryByText('Project agent')).toBeNull()
    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'End selected (1)' }))
    )
    expect(mocks.terminate).toHaveBeenCalledWith([mocks.rows[1]])
  })

  it('clears selection when changing search so hidden sessions cannot be ended', () => {
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all filtered terminals' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search agents and terminals' }), {
      target: { value: 'Independent' }
    })
    expect(screen.queryByRole('button', { name: 'End selected…' })).toBeNull()
    expect(mocks.terminate).not.toHaveBeenCalled()
  })

  it('blocks destructive controls when inventory is incomplete', () => {
    mocks.incomplete = true
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain('could not be fully verified')
    for (const button of screen.getAllByRole('button', { name: 'End terminal' })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(
      (screen.getByRole('checkbox', { name: 'Select all filtered terminals' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it('uses an accessible trash icon and confirms before ending one terminal', () => {
    renderPage()
    const button = screen.getAllByRole('button', { name: 'End terminal' })[0]
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).toBeTruthy()
    fireEvent.click(button)
    expect(within(screen.getByRole('dialog')).getByText('Project agent')).toBeTruthy()
    expect(mocks.terminate).not.toHaveBeenCalled()
  })
})
