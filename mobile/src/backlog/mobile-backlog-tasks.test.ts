import { describe, expect, it } from 'vitest'
import type { BacklogTask } from '../../../src/shared/backlog-types'
import { mobileBacklogStatuses, selectMobileBacklogTasks } from './mobile-backlog-tasks'

const tasks: BacklogTask[] = [
  { id: 'TASK-10', title: 'Review diff', status: 'In Progress', priority: 'Medium', ordinal: 2 },
  { id: 'TASK-2', title: 'Open terminal', status: 'To Do', priority: 'High', ordinal: 1 },
  { id: 'TASK-3', title: 'Ship Android', status: 'To Do', priority: 'Low', ordinal: 3 }
]

describe('mobile Backlog task selection', () => {
  it('keeps board order and supports status and text search', () => {
    expect(
      selectMobileBacklogTasks(tasks, { query: '', status: null, order: 'ordinal' }).map(
        (task) => task.id
      )
    ).toEqual(['TASK-2', 'TASK-10', 'TASK-3'])
    expect(
      selectMobileBacklogTasks(tasks, {
        query: 'TASK-10',
        status: 'In Progress',
        order: 'ordinal'
      }).map((task) => task.id)
    ).toEqual(['TASK-10'])
    expect(
      selectMobileBacklogTasks(tasks, {
        query: 'terminal',
        status: 'In Progress',
        order: 'ordinal'
      })
    ).toEqual([])
  })

  it('uses the shared ID and priority order and exposes only actual statuses', () => {
    expect(
      selectMobileBacklogTasks(tasks, { query: '', status: null, order: 'id' }).map(
        (task) => task.id
      )
    ).toEqual(['TASK-2', 'TASK-3', 'TASK-10'])
    expect(
      selectMobileBacklogTasks(tasks, { query: '', status: null, order: 'priority' }).map(
        (task) => task.id
      )
    ).toEqual(['TASK-2', 'TASK-10', 'TASK-3'])
    expect(mobileBacklogStatuses(tasks)).toEqual(['In Progress', 'To Do'])
  })
})
