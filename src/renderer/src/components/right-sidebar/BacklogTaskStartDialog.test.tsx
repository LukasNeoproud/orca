// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  options: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
  agent: 'codex' as string | null,
  repos: [{ id: 'repo', kind: 'git', executionHostId: 'local' }]
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ repos: mock.repos })
}))
vi.mock('@/lib/backlog-task-association-client', () => ({ readBacklogTaskAssociation: mock.read }))
vi.mock('@/lib/backlog-task-handoff', () => ({
  getBacklogTaskWorkspaceOptions: () => [{ id: 'source', repoId: 'repo', displayName: 'Source' }],
  getBacklogTaskConversationOptions: mock.options,
  startBacklogTask: mock.start
}))
vi.mock('./backlog-task-start-request', () => ({ closeBacklogTaskStart: mock.close }))
vi.mock('@/components/native-chat/use-structured-agent-launch-support', () => ({
  useStructuredAgentLaunchSupport: () => ({ codex: true, claude: true })
}))
vi.mock('./use-backlog-task-agent', () => ({
  useBacklogTaskAgent: () => ({
    agents: [{ id: 'codex', label: 'Codex' }],
    agent: mock.agent,
    setAgent: vi.fn(),
    isLoading: false
  })
}))
vi.mock('@/components/agent/AgentCombobox', () => ({ default: () => <span>Codex</span> }))
vi.mock('@/components/automations/WorkspaceCombobox', () => ({
  WorkspaceCombobox: () => <span>Source workspace</span>
}))
vi.mock('./BacklogConversationPicker', () => ({
  BacklogConversationPicker: ({
    value,
    choices,
    onChange
  }: {
    value: string
    choices: { id: string; label: string }[]
    onChange: (id: string) => void
  }) => (
    <select
      aria-label="Conversation"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.label}
        </option>
      ))}
    </select>
  )
}))
vi.mock('./BacklogTaskWorktreeComposer', () => ({
  BacklogTaskWorktreeComposer: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <button onClick={() => onCreated('created')}>Create worktree</button>
  )
}))
import BacklogTaskStartDialog from './BacklogTaskStartDialog'
const route = {
  workspaceId: 'source',
  executionHostId: 'local' as const,
  runtimeEnvironmentId: null
}
const request = { route, task: { id: 'TASK-1', title: 'Task', status: 'Done', priority: null } }
const association = { attemptId: 'attempt', deliveryStatus: 'unverified' }

describe('Backlog start dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.agent = 'codex'
    mock.repos = [{ id: 'repo', kind: 'git', executionHostId: 'local' }]
    mock.read.mockResolvedValue(null)
    mock.options.mockResolvedValue([])
    mock.start.mockResolvedValue({ association, status: 'confirmed' })
  })
  afterEach(cleanup)
  it('guards double clicks and presents an acknowledged result', async () => {
    let complete!: (value: unknown) => void
    mock.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    const button = screen.getByRole('button', { name: 'Start task' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mock.start).toHaveBeenCalledTimes(1)
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRoute: route,
        taskId: 'TASK-1',
        expectedAttemptId: null,
        conversation: { kind: 'new', agent: 'codex' }
      })
    )
    await act(async () => complete({ association, status: 'confirmed' }))
    expect(screen.getByRole('status').textContent).toContain('Task handed')
  })
  it('retains a durable ambiguous attempt and never offers an automatic resend', async () => {
    mock.read.mockResolvedValueOnce(null).mockResolvedValue(association)
    mock.start.mockRejectedValue(new Error('Connection lost'))
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Start task' }))
    expect((await screen.findByRole('status')).textContent).toContain('unverified')
    expect(screen.queryByRole('button', { name: 'Start task' })).toBeNull()
    expect(mock.start).toHaveBeenCalledTimes(1)
  })
  it('uses the selected existing conversation and its agent', async () => {
    const conversation = {
      id: 'existing',
      title: 'Existing Claude',
      agent: 'claude',
      surface: 'terminal'
    }
    mock.options.mockResolvedValue([conversation])
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox', { name: 'Conversation' }), {
      target: { value: 'existing' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start task' }))
    await act(async () => {})
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({ conversation: { kind: 'existing', conversation } })
    )
  })
  it('supports explicitly starting a new structured chat through the existing chat capability', async () => {
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox', { name: 'Conversation' }), {
      target: { value: 'new-chat' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start task' }))
    await act(async () => {})
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: { kind: 'new', agent: 'codex', surface: 'structured' }
      })
    )
  })

  it('keeps the selected agent across worktree creation when detection changes', async () => {
    const view = render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'New worktree' }))
    mock.agent = null
    view.rerender(<BacklogTaskStartDialog request={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))
    await act(async () => {})
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({ conversation: { kind: 'new', agent: 'codex' } })
    )
  })

  it('does not offer a worktree based on another host’s same-id Git project', async () => {
    mock.repos = [
      { id: 'repo', kind: 'git', executionHostId: 'ssh:other' },
      { id: 'repo', kind: 'folder', executionHostId: 'local' }
    ]
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'New worktree' })).toBeNull()
  })

  it('hands off to the actual created workspace while retaining the source', async () => {
    render(<BacklogTaskStartDialog request={request} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'New worktree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))
    await act(async () => {})
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRoute: route,
        targetRoute: { ...route, workspaceId: 'created' }
      })
    )
  })
})
