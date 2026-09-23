import type { BacklogTask } from '../../../src/shared/backlog-types'
import { orderBacklogTasks, type BacklogTaskOrder } from '../../../src/shared/backlog-task-order'

export function selectMobileBacklogTasks(
  tasks: readonly BacklogTask[],
  options: {
    query: string
    status: string | null
    order: BacklogTaskOrder
    priorities?: readonly string[]
  }
): BacklogTask[] {
  const query = options.query.trim().toLocaleLowerCase()
  return orderBacklogTasks(
    tasks.filter(
      (task) =>
        (!options.status || task.status === options.status) &&
        (!query || `${task.id} ${task.title}`.toLocaleLowerCase().includes(query))
    ),
    options.order,
    options.priorities
  )
}

export function mobileBacklogStatuses(tasks: readonly BacklogTask[]): string[] {
  return [...new Set(tasks.map((task) => task.status))]
}
