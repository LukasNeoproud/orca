// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ read: vi.fn(), resume: vi.fn(), open: vi.fn() }))
vi.mock('@/lib/backlog-rpc', () => ({
  resolveBacklogRoute: (workspaceId: string) => ({
    workspaceId,
    executionHostId: 'local',
    runtimeEnvironmentId: null
  })
}))
vi.mock('@/lib/backlog-task-association-client', () => ({ readBacklogTaskAssociation: mock.read }))
vi.mock('@/lib/backlog-task-handoff', () => ({ continueBacklogTask: mock.resume }))
vi.mock('./backlog-task-start-request', () => ({
  requestBacklogTaskStart: mock.open,
  useBacklogTaskStartRequest: () => null
}))
vi.mock('./BacklogAssociationContext', () => ({
  useBacklogAssociationContext: () => ({ unavailable: false }),
  BacklogAssociationContext: () => <span>Workspace · Agent · Conversation</span>
}))
import BacklogTaskAction from './BacklogTaskAction'
const task = { id: 'TASK-1', title: 'Task', status: 'Done', priority: null }
const association = { attemptId: 'attempt', deliveryStatus: 'unverified' }

describe('Backlog task action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.read.mockResolvedValue(null)
  })
  afterEach(cleanup)
  it('offers starting tasks even when already done', async () => {
    render(<BacklogTaskAction workspaceId="source" task={task} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Start task' }))
    expect(mock.open).toHaveBeenCalledWith('source', task)
  })
  it('continues an unverified attempt once without opening a resend dialog', async () => {
    mock.read.mockResolvedValue(association)
    let finish!: (value: unknown) => void
    mock.resume.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<BacklogTaskAction workspaceId="source" task={task} />)
    const button = await screen.findByRole('button', { name: 'Continue' })
    fireEvent.click(button)
    fireEvent.click(button)
    await act(async () => {})
    expect(mock.resume).toHaveBeenCalledTimes(1)
    expect(mock.open).not.toHaveBeenCalled()
    await act(async () => finish({ status: 'activated' }))
    expect(screen.getByText(/Delivery is unverified/)).toBeTruthy()
  })
  it('keeps unverifiable ownership visible and permits an explicit new selection', async () => {
    mock.read.mockResolvedValue(association)
    mock.resume.mockResolvedValue({ status: 'unverifiable' })
    render(<BacklogTaskAction workspaceId="source" task={task} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toContain('unverifiable')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Conversation actions' }), {
      button: 0,
      ctrlKey: false
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Choose another conversation' }))
    expect(mock.open).toHaveBeenCalledTimes(1)
  })
  it('never actions a previous task association while the next workspace is loading', async () => {
    mock.read.mockResolvedValueOnce(association).mockImplementationOnce(() => new Promise(() => {}))
    const view = render(<BacklogTaskAction workspaceId="source" task={task} />)
    await screen.findByRole('button', { name: 'Continue' })
    view.rerender(<BacklogTaskAction workspaceId="other" task={task} />)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start task' }))
    expect(mock.resume).not.toHaveBeenCalled()
    expect(mock.open).not.toHaveBeenCalled()
  })

  it('shows the update requirement without losing task details', async () => {
    mock.read.mockRejectedValue(
      new Error('Update the connected Orca runtime to start Backlog tasks.')
    )
    render(<BacklogTaskAction workspaceId="source" task={task} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Update')
  })
})
