import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  openBacklogBoard,
  readBacklogTask,
  refreshBacklog,
  subscribeBacklog
} from '@/lib/backlog-client'
import BacklogTaskDetail from './BacklogTaskDetail'
import { orderBacklogTasks, type BacklogTaskOrder } from './backlog-task-order'
import type { BacklogSnapshot, BacklogTask } from '../../../../shared/backlog-types'

const DOCS_URL = 'https://github.com/MrLesk/Backlog.md'
const INITIAL_SNAPSHOT: BacklogSnapshot = { state: 'loading', tasks: [] }
const ALL_STATUSES = 'all'
const STATUS_VALUE_PREFIX = 'status:'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function BacklogPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  const executionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  return (
    <BacklogPanelForWorkspace
      key={`${executionHostId ?? ''}:${workspaceId ?? ''}`}
      isVisible={isVisible}
      workspaceId={workspaceId}
    />
  )
}

function BacklogPanelForWorkspace({
  isVisible,
  workspaceId
}: {
  isVisible: boolean
  workspaceId: string | null
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<BacklogSnapshot>(INITIAL_SNAPSHOT)
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<BacklogTaskOrder>('ordinal')
  const [status, setStatus] = useState(ALL_STATUSES)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detail, setDetail] = useState<BacklogTask | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRequest, setDetailRequest] = useState(0)

  useEffect(() => {
    if (!isVisible || !workspaceId) {
      return
    }
    return subscribeBacklog(workspaceId, setSnapshot)
  }, [isVisible, workspaceId])

  useEffect(() => {
    if (!isVisible || !workspaceId || !selectedTaskId) {
      return
    }
    let current = true
    void readBacklogTask(workspaceId, selectedTaskId)
      .then((task) => {
        if (current) {
          setDetail(task)
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setDetailError(errorMessage(error))
        }
      })
    return () => {
      current = false
    }
  }, [isVisible, workspaceId, selectedTaskId, detailRequest])

  const statuses = useMemo(
    () => Array.from(new Set(snapshot.tasks.map((task) => task.status))).sort(),
    [snapshot.tasks]
  )
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return orderBacklogTasks(snapshot.tasks, order, snapshot.priorities).filter(
      (task) =>
        (status === ALL_STATUSES || task.status === status.slice(STATUS_VALUE_PREFIX.length)) &&
        (!needle || `${task.id} ${task.title}`.toLocaleLowerCase().includes(needle))
    )
  }, [snapshot.tasks, snapshot.priorities, order, status, query])

  const openBoard = (): void => {
    if (!workspaceId) {
      return
    }
    void openBacklogBoard(workspaceId).catch((error: unknown) => {
      toast.error(
        translate('components.backlog.openFailed', 'Could not open Backlog.md: {{value0}}', {
          value0: errorMessage(error)
        })
      )
    })
  }

  const retry = (): void => {
    if (workspaceId) {
      refreshBacklog(workspaceId)
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col text-sidebar-foreground"
      aria-label="Backlog.md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium">
          {selectedTaskId
            ? translate('components.backlog.taskDetails', 'Task details')
            : 'Backlog.md'}
        </span>
        <div className="flex items-center gap-1">
          {selectedTaskId ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('components.backlog.backToTasks', 'Back to tasks')}
              onClick={() => setSelectedTaskId(null)}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('components.backlog.refresh', 'Refresh backlog')}
              onClick={retry}
              disabled={!workspaceId}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          <Button variant="outline" size="xs" onClick={openBoard} disabled={!workspaceId}>
            {translate('components.backlog.openBoard', 'Open board')}{' '}
            <ExternalLink className="size-3" />
          </Button>
        </div>
      </div>

      {!workspaceId ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {translate(
            'components.backlog.selectWorkspace',
            'Select a workspace to view its backlog.'
          )}
        </p>
      ) : selectedTaskId ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-sleek">
          {detailError ? (
            <div className="space-y-2 text-xs">
              <p role="alert" className="text-destructive">
                {detailError}
              </p>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setDetail(null)
                  setDetailError(null)
                  setDetailRequest((request) => request + 1)
                }}
              >
                {translate('components.backlog.retry', 'Retry')}
              </Button>
            </div>
          ) : !detail ? (
            <p className="text-xs text-muted-foreground">
              {translate('components.backlog.loadingTask', 'Loading task…')}
            </p>
          ) : (
            <BacklogTaskDetail task={detail} />
          )}
        </div>
      ) : snapshot.state === 'error' ? (
        <div className="space-y-3 px-3 py-4 text-xs">
          <p role="alert" className="text-destructive">
            {snapshot.error ??
              translate('components.backlog.loadFailed', 'Could not load the backlog.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="xs" onClick={retry}>
              {translate('components.backlog.retry', 'Retry')}
            </Button>
            <Button
              variant="link"
              size="xs"
              onClick={() => void window.api.shell.openUrl(DOCS_URL)}
            >
              {translate('components.backlog.setup', 'Backlog.md setup')}
            </Button>
          </div>
        </div>
      ) : snapshot.state === 'loading' ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {translate('components.backlog.loading', 'Loading backlog…')}
        </p>
      ) : (
        <>
          <div className="space-y-2 border-b border-sidebar-border px-3 py-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={translate('components.backlog.searchTasks', 'Search backlog tasks')}
                placeholder={translate(
                  'components.backlog.searchPlaceholder',
                  'Search ID or title'
                )}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger
                  size="sm"
                  aria-label={translate('components.backlog.filterStatus', 'Filter task status')}
                  className="min-w-0 max-w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value={ALL_STATUSES}>
                    {translate('components.backlog.allStatuses', 'All statuses')}
                  </SelectItem>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={`${STATUS_VALUE_PREFIX}${value}`}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {translate('components.backlog.taskCount', '{{value0}} of {{value1}}', {
                  value0: filteredTasks.length,
                  value1: snapshot.tasks.length
                })}
              </span>
            </div>
            <Select value={order} onValueChange={(value) => setOrder(value as BacklogTaskOrder)}>
              <SelectTrigger
                size="sm"
                aria-label={translate('components.backlog.sortTasks', 'Sort tasks')}
                className="w-full min-w-0 text-xs"
              >
                <span className="text-muted-foreground">
                  {translate('components.backlog.sortBy', 'Sort by')}
                </span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="ordinal">
                  {translate('components.backlog.sortBacklog', 'Backlog order')}
                </SelectItem>
                <SelectItem value="id">
                  {translate('components.backlog.sortId', 'Task ID')}
                </SelectItem>
                <SelectItem value="priority">
                  {translate('components.backlog.sortPriority', 'Priority')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {snapshot.tasks.length === 0 ? (
            <div className="space-y-2 px-3 py-4 text-xs text-muted-foreground">
              <p>
                {translate('components.backlog.empty', 'No backlog tasks found in this workspace.')}
              </p>
              <Button
                variant="link"
                size="xs"
                onClick={() => void window.api.shell.openUrl(DOCS_URL)}
              >
                {translate('components.backlog.setup', 'Backlog.md setup')}
              </Button>
            </div>
          ) : filteredTasks.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              {translate('components.backlog.noMatches', 'No tasks match the search or status.')}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-sleek">
              {filteredTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDetail(null)
                      setDetailError(null)
                      setSelectedTaskId(task.id)
                    }}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                  >
                    <span className="block truncate text-xs font-medium">{task.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      <span className="font-mono">{task.id}</span> · {task.status}
                      {task.priority ? ` · ${task.priority}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
