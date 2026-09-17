import { describe, expect, it } from 'vitest'
import type { BacklogTask } from '../../../../shared/backlog-types'
import { orderBacklogTasks } from './backlog-task-order'

const task = (id: string, ordinal?: number, priority: string | null = null): BacklogTask => ({
  id,
  title: id,
  status: 'To Do',
  priority,
  ...(ordinal === undefined ? {} : { ordinal })
})
const ids = (tasks: BacklogTask[]) => tasks.map((item) => item.id)

describe('Backlog task order', () => {
  it('orders ordinals first, then natural IDs for ties and missing legacy metadata', () => {
    const tasks = Object.freeze([
      task('TASK-10'),
      task('TASK-3', 20),
      task('TASK-2'),
      task('TASK-11', 10),
      task('TASK-1', 20)
    ])
    expect(ids(orderBacklogTasks(tasks, 'ordinal'))).toEqual([
      'TASK-11',
      'TASK-1',
      'TASK-3',
      'TASK-2',
      'TASK-10'
    ])
    expect(tasks[0].id).toBe('TASK-10')
    expect(ids(orderBacklogTasks([task('TASK-10'), task('TASK-2')], 'ordinal'))).toEqual([
      'TASK-2',
      'TASK-10'
    ])
  })

  it('uses natural numeric IDs regardless of task order or priority', () => {
    expect(ids(orderBacklogTasks([task('TASK-10', 1, 'High'), task('TASK-2', 2)], 'id'))).toEqual([
      'TASK-2',
      'TASK-10'
    ])
  })

  it('respects custom priority order, sorts unknown labels and puts missing priorities last', () => {
    const tasks = [
      task('TASK-9'),
      task('TASK-8', 1, 'Later'),
      task('TASK-10', 2, 'Now'),
      task('TASK-2', 3, 'now'),
      task('TASK-6', 4, 'Z'),
      task('TASK-7', 5, 'A')
    ]
    expect(ids(orderBacklogTasks(tasks, 'priority', ['Now', 'Later']))).toEqual([
      'TASK-2',
      'TASK-10',
      'TASK-8',
      'TASK-7',
      'TASK-6',
      'TASK-9'
    ])
  })

  it('falls back to default priorities for older runtimes', () => {
    expect(
      ids(
        orderBacklogTasks(
          [
            task('TASK-1', undefined, 'Low'),
            task('TASK-3', undefined, 'High'),
            task('TASK-2', undefined, 'Medium')
          ],
          'priority'
        )
      )
    ).toEqual(['TASK-3', 'TASK-2', 'TASK-1'])
  })
})
