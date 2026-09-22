import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { BacklogTaskOrder } from './backlog-task-order'

export const ALL_BACKLOG_STATUSES = 'all'
export const BACKLOG_STATUS_PREFIX = 'status:'

export function BacklogTaskFilters({
  status,
  statuses,
  order,
  onStatus,
  onOrder
}: {
  status: string
  statuses: string[]
  order: BacklogTaskOrder
  onStatus: (value: string) => void
  onOrder: (value: BacklogTaskOrder) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger
          size="sm"
          aria-label={translate('components.backlog.filterStatus', 'Filter task status')}
          className="w-full min-w-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value={ALL_BACKLOG_STATUSES}>
            {translate('components.backlog.allStatuses', 'All statuses')}
          </SelectItem>
          {statuses.map((value) => (
            <SelectItem key={value} value={`${BACKLOG_STATUS_PREFIX}${value}`}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={order} onValueChange={(value) => onOrder(value as BacklogTaskOrder)}>
        <SelectTrigger
          size="sm"
          aria-label={translate('components.backlog.sortTasks', 'Sort tasks')}
          className="w-full min-w-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="ordinal">
            {translate('components.backlog.sortBacklog', 'Backlog order')}
          </SelectItem>
          <SelectItem value="id">{translate('components.backlog.sortId', 'Task ID')}</SelectItem>
          <SelectItem value="priority">
            {translate('components.backlog.sortPriority', 'Priority')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
