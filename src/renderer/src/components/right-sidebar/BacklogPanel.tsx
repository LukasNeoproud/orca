import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BacklogTaskList } from './BacklogTaskList'
import { BacklogTaskFilters } from './BacklogTaskFilters'
import { useBacklogTaskAssociations } from './use-backlog-task-associations'
import { translate } from '@/i18n/i18n'
import {
  openBacklogBoard,
  readBacklogTask,
  refreshBacklog,
  subscribeBacklog
} from '@/lib/backlog-client'
import BacklogTaskAction from './BacklogTaskAction'
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
  const linked = useBacklogTaskAssociations(workspaceId, isVisible)

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

  const showDetail = selectedTaskId !== null
  const clearFilters = (): void => {
    setQuery('')
    setStatus(ALL_STATUSES)
  }
  return (
    <section
      className="flex min-h-0 flex-1 flex-col text-sidebar-foreground"
      aria-label="Backlog.md"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showDetail && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          setSelectedTaskId(null)
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2">
        {showDetail ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate('components.backlog.backToTasks', 'Back to tasks')}
                onClick={() => setSelectedTaskId(null)}
              >
                <ArrowLeft className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('components.backlog.backToTasks', 'Back to tasks')}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <span
          className={
            showDetail
              ? 'min-w-0 flex-1 truncate font-mono text-xs'
              : 'min-w-0 flex-1 truncate text-xs font-medium'
          }
        >
          {selectedTaskId ?? 'Backlog.md'}
        </span>
        {!showDetail && snapshot.state === 'ready' ? (
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {translate('components.backlog.taskCount', '{{value0}} of {{value1}}', {
              value0: filteredTasks.length,
              value1: snapshot.tasks.length
            })}
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('components.backlog.refresh', 'Refresh backlog')}
              disabled={!workspaceId}
              onClick={() => {
                retry()
                if (showDetail) {
                  setDetailError(null)
                  setDetailRequest((value) => value + 1)
                }
              }}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('components.backlog.refresh', 'Refresh backlog')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={openBoard}
              disabled={!workspaceId}
              aria-label={translate('components.backlog.openBoard', 'Open board')}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{translate('components.backlog.openBoard', 'Open board')}</TooltipContent>
        </Tooltip>
      </div>
      {workspaceId ? (
        <div className="space-y-2 border-b border-sidebar-border px-3 py-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={translate('components.backlog.searchTasks', 'Search backlog tasks')}
              placeholder={translate('components.backlog.searchPlaceholder', 'Search ID or title')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          {!showDetail ? (
            <BacklogTaskFilters
              status={status}
              statuses={statuses}
              order={order}
              onStatus={setStatus}
              onOrder={setOrder}
            />
          ) : null}
        </div>
      ) : null}
      {!workspaceId ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {translate(
            'components.backlog.selectWorkspace',
            'Select a workspace to view its backlog.'
          )}
        </p>
      ) : null}
      {workspaceId && showDetail ? (
        <div className="flex min-h-0 flex-1 flex-col">
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
                    setDetailError(null)
                    setDetailRequest((value) => value + 1)
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
          {detail && !detailError ? (
            <div className="shrink-0 border-t border-sidebar-border bg-sidebar px-3 py-3">
              <BacklogTaskAction key={detail.id} workspaceId={workspaceId} task={detail} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={showDetail || !workspaceId ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        {snapshot.state === 'error' ? (
          <div className="space-y-3 px-3 py-4 text-xs">
            <p role="alert" className="text-destructive">
              {snapshot.error ??
                translate('components.backlog.loadFailed', 'Could not load the backlog.')}
            </p>
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
        ) : snapshot.state === 'loading' ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {translate('components.backlog.loading', 'Loading backlog…')}
          </p>
        ) : snapshot.tasks.length === 0 ? (
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
          <div className="space-y-2 px-3 py-4 text-xs text-muted-foreground">
            <p>
              {translate('components.backlog.noMatches', 'No tasks match the search or status.')}
            </p>
            <Button variant="outline" size="xs" onClick={clearFilters}>
              {translate('components.backlog.clearFilters', 'Clear filters')}
            </Button>
          </div>
        ) : (
          <BacklogTaskList
            tasks={filteredTasks}
            linked={linked}
            visible={!showDetail}
            selectedId={selectedTaskId}
            onOpen={(id) => {
              setDetail(null)
              setDetailError(null)
              setSelectedTaskId(id)
            }}
          />
        )}
      </div>
    </section>
  )
}
