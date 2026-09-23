import type { BacklogTask } from './backlog-types'
import { compareNumericLocaleText } from './locale-text-collators'

export type BacklogTaskOrder = 'ordinal' | 'id' | 'priority'

const DEFAULT_PRIORITIES = ['High', 'Medium', 'Low']

function compareIds(left: BacklogTask, right: BacklogTask): number {
  return (
    compareNumericLocaleText(left.id, right.id) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  )
}

export function orderBacklogTasks(
  tasks: readonly BacklogTask[],
  order: BacklogTaskOrder,
  priorities: readonly string[] = DEFAULT_PRIORITIES
): BacklogTask[] {
  const ranks = new Map(priorities.map((priority, index) => [priority.toLowerCase(), index]))
  const priorityRank = (value: string | null): number =>
    value ? (ranks.get(value.toLowerCase()) ?? priorities.length) : priorities.length + 1
  return [...tasks].sort((left, right) => {
    if (order === 'ordinal') {
      const ordinalDifference = (left.ordinal ?? Infinity) - (right.ordinal ?? Infinity)
      if (ordinalDifference) {
        return ordinalDifference
      }
    }
    if (order === 'priority') {
      const rankDifference = priorityRank(left.priority) - priorityRank(right.priority)
      if (rankDifference) {
        return rankDifference
      }
      if (priorityRank(left.priority) === priorities.length) {
        const labelDifference = compareNumericLocaleText(left.priority ?? '', right.priority ?? '')
        if (labelDifference) {
          return labelDifference
        }
      }
    }
    return compareIds(left, right)
  })
}
