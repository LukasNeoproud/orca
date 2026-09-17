// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacklogSnapshot, BacklogTask } from '../../../../shared/backlog-types'

const mock = vi.hoisted(() => ({
  store: { activeWorktreeId: 'wt-1', activeWorkspaceExecutionHostId: 'local' },
  subscribeBacklog: vi.fn(),
  readBacklogTask: vi.fn(),
  refreshBacklog: vi.fn(),
  openBacklogBoard: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: typeof mock.store) => T): T => selector(mock.store)
}))
vi.mock('@/lib/backlog-client', () => ({
  subscribeBacklog: mock.subscribeBacklog,
  readBacklogTask: mock.readBacklogTask,
  refreshBacklog: mock.refreshBacklog,
  openBacklogBoard: mock.openBacklogBoard
}))

import BacklogPanel from './BacklogPanel'

const tasks: BacklogTask[] = [
  { id: 'TASK-1', title: 'Fix login', status: 'To Do', priority: 'High' },
  { id: 'TASK-2', title: 'Write docs', status: 'Done', priority: null }
]

describe('BacklogPanel', () => {
  beforeEach(() => {
    mock.store.activeWorktreeId = 'wt-1'
    mock.store.activeWorkspaceExecutionHostId = 'local'
    mock.subscribeBacklog.mockImplementation(
      (_workspaceId: string, listener: (snapshot: BacklogSnapshot) => void) => {
        listener({
          state: 'ready',
          tasks:
            mock.store.activeWorkspaceExecutionHostId === 'local'
              ? tasks
              : [{ id: 'TASK-B', title: 'Second host task', status: 'In Progress', priority: null }]
        })
        return vi.fn()
      }
    )
    mock.readBacklogTask.mockResolvedValue({
      ...tasks[0],
      description: 'Restore sign in',
      acceptanceCriteria: [{ index: 1, text: 'Login succeeds', checked: false }]
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('filters tasks, reads details, and resets when the selected host changes', async () => {
    const view = render(<BacklogPanel isVisible />)
    expect(await screen.findByText('Fix login')).toBeTruthy()
    expect(screen.getByText('2 of 2')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search backlog tasks' }), {
      target: { value: 'TASK-1' }
    })
    expect(screen.queryByText('Write docs')).toBeNull()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter task status' }), {
      key: 'ArrowDown'
    })
    fireEvent.click(screen.getByRole('option', { name: 'Done' }))
    expect(screen.getByText('No tasks match the search or status.')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter task status' }), {
      key: 'ArrowDown'
    })
    fireEvent.click(screen.getByRole('option', { name: 'All statuses' }))
    fireEvent.click(screen.getByRole('button', { name: /Fix login/ }))
    expect(await screen.findByText('Restore sign in')).toBeTruthy()
    expect(screen.getByText('Login succeeds')).toBeTruthy()

    await act(async () => {
      mock.store.activeWorkspaceExecutionHostId = 'ssh:other'
      view.rerender(<BacklogPanel isVisible />)
    })
    await waitFor(() => expect(screen.getByText('Second host task')).toBeTruthy())
    expect(screen.queryByText('Restore sign in')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Search backlog tasks' })).toHaveProperty(
      'value',
      ''
    )
    expect(mock.subscribeBacklog).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a task status named all from the All statuses filter', async () => {
    mock.subscribeBacklog.mockImplementationOnce(
      (_workspaceId: string, listener: (snapshot: BacklogSnapshot) => void) => {
        listener({
          state: 'ready',
          tasks: [
            { id: 'TASK-ALL', title: 'Literal all status', status: 'all', priority: null },
            { id: 'TASK-DONE', title: 'Completed task', status: 'Done', priority: null }
          ]
        })
        return vi.fn()
      }
    )
    render(<BacklogPanel isVisible />)
    expect(await screen.findByText('Literal all status')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter task status' }), {
      key: 'ArrowDown'
    })
    fireEvent.click(screen.getByRole('option', { name: 'all' }))
    expect(screen.getByText('Literal all status')).toBeTruthy()
    expect(screen.queryByText('Completed task')).toBeNull()
  })

  it('keeps the selected order through filtering, snapshots and detail navigation', async () => {
    let publish: (snapshot: BacklogSnapshot) => void = () => {}
    const orderedTasks: BacklogTask[] = [
      { id: 'TASK-10', title: 'Task ten', status: 'To Do', priority: 'Next', ordinal: 1 },
      { id: 'TASK-2', title: 'Task two', status: 'To Do', priority: 'Now', ordinal: 2 },
      { id: 'TASK-1', title: 'Task one', status: 'Done', priority: null, ordinal: 3 }
    ]
    mock.subscribeBacklog.mockImplementationOnce((_id, listener) => {
      publish = listener
      listener({ state: 'ready', tasks: orderedTasks, priorities: ['Now', 'Next'] })
      return vi.fn()
    })
    render(<BacklogPanel isVisible />)
    const titles = () =>
      screen.getAllByRole('listitem').map((row) => row.textContent?.split('TASK-')[0])
    expect(titles()).toEqual(['Task ten', 'Task two', 'Task one'])
    const select = (control: string, option: string) => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: control }), { key: 'ArrowDown' })
      fireEvent.click(screen.getByRole('option', { name: option }))
    }
    select('Sort tasks', 'Task ID')
    expect(titles()).toEqual(['Task one', 'Task two', 'Task ten'])
    select('Filter task status', 'To Do')
    select('Sort tasks', 'Priority')
    expect(titles()).toEqual(['Task two', 'Task ten'])
    fireEvent.change(screen.getByRole('textbox', { name: 'Search backlog tasks' }), {
      target: { value: 'Task' }
    })
    act(() =>
      publish({ state: 'ready', tasks: orderedTasks.toReversed(), priorities: ['Next', 'Now'] })
    )
    expect(titles()).toEqual(['Task ten', 'Task two'])
    fireEvent.click(screen.getByRole('button', { name: /Task ten/ }))
    expect(await screen.findByText('Restore sign in')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to tasks' }))
    expect(screen.getByRole('combobox', { name: 'Sort tasks' }).textContent).toContain('Priority')
    expect(titles()).toEqual(['Task ten', 'Task two'])
    expect(orderedTasks.map((task) => task.id)).toEqual(['TASK-10', 'TASK-2', 'TASK-1'])
  })
})
