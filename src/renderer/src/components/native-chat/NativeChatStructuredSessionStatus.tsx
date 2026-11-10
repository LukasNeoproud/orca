import { useContext, useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { NativeChatSidePanelContext } from './native-chat-side-panel-context'
import { NativeChatBackgroundTasksStatus } from './NativeChatBackgroundTasksStatus'
import type { AgentSessionCancelResult } from '../../../../shared/agent-session-wire'
import {
  structuredSessionConfirmedStopsStillListed,
  structuredSessionListedTaskRun,
  type StructuredSessionBackgroundTasksView
} from '../../../../shared/structured-session-background-tasks-view'
import { useStructuredSessionChildRowContext } from './use-structured-session-child-row-context'

type StoppingBackgroundTasks = {
  sessionId: string
  taskIds: ReadonlySet<string>
  all: boolean
}

/** Each confirmed Stop's task, with the run it was pressed on. */
type ConfirmedStops = { sessionId: string; taskIds: ReadonlyMap<string, string> }

const NO_STOPPING_TASKS: ReadonlySet<string> = new Set()
const NO_CONFIRMED_STOPS: ReadonlyMap<string, string> = new Map()

export type NativeChatStructuredSessionStatusProps = {
  sessionId: string
  /** The session's own status row, whose verdict the strip's children read. */
  paneKey: string
  isVisible: boolean
  backgroundTasks: StructuredSessionBackgroundTasksView
  stopBackgroundTask: (taskId?: string) => Promise<AgentSessionCancelResult | null>
}

export function NativeChatStructuredSessionStatus(
  props: NativeChatStructuredSessionStatusProps & {
    /** The side panel's copy lists its tasks from the start; the strip opens on a press. */
    startsExpanded?: boolean
  }
): React.JSX.Element {
  // The panel beside the chat draws the same tasks from what the strip is given.
  const publish = useContext(NativeChatSidePanelContext)?.publish
  const { sessionId, paneKey, isVisible, backgroundTasks, stopBackgroundTask } = props
  useEffect(() => {
    publish?.({
      background: { sessionId, paneKey, isVisible, backgroundTasks, stopBackgroundTask }
    })
  }, [backgroundTasks, isVisible, paneKey, publish, sessionId, stopBackgroundTask])
  const [stopping, setStopping] = useState<StoppingBackgroundTasks | null>(null)
  // Stops the host confirmed, with the run each was pressed on: each row keeps its stopping button
  // until that run leaves the strip.
  const [confirmed, setConfirmed] = useState<ConfirmedStops | null>(null)
  const [expanded, setExpanded] = useState<{ sessionId: string; expanded: boolean } | null>(null)
  const activeStopping = stopping?.sessionId === props.sessionId ? stopping : null
  const activeConfirmed = confirmed?.sessionId === props.sessionId ? confirmed.taskIds : null
  const confirmedListed = activeConfirmed
    ? structuredSessionConfirmedStopsStillListed(props.backgroundTasks, activeConfirmed)
    : null
  if (confirmedListed !== activeConfirmed) {
    // A row that left and came back is a task the Stop did not end, so it offers Stop again.
    setConfirmed(
      confirmedListed?.size ? { sessionId: props.sessionId, taskIds: confirmedListed } : null
    )
  }
  const stoppingTaskIds = confirmedListed?.size
    ? new Set([...(activeStopping?.taskIds ?? NO_STOPPING_TASKS), ...confirmedListed.keys()])
    : (activeStopping?.taskIds ?? NO_STOPPING_TASKS)
  const childRowContext = useStructuredSessionChildRowContext(props.paneKey)

  const onStop = (taskId?: string) => {
    const sessionId = props.sessionId
    // A provider may reuse the row's id for the task's next run, which this Stop did not end.
    const run = taskId ? structuredSessionListedTaskRun(props.backgroundTasks, taskId) : null
    setStopping((current) => {
      const taskIds = new Set(
        current?.sessionId === sessionId ? current.taskIds : NO_STOPPING_TASKS
      )
      if (taskId) {
        taskIds.add(taskId)
      }
      return {
        sessionId,
        taskIds,
        all: taskId ? current?.sessionId === sessionId && current.all : true
      }
    })
    void props
      .stopBackgroundTask(taskId)
      .then((result) => {
        if (taskId && run !== null && result?.cancelled) {
          setConfirmed((current) => ({
            sessionId,
            taskIds: new Map([
              ...(current?.sessionId === sessionId ? current.taskIds : NO_CONFIRMED_STOPS),
              [taskId, run]
            ])
          }))
        }
      })
      .finally(() => {
        setStopping((current) => {
          if (current?.sessionId !== sessionId) {
            return current
          }
          const taskIds = new Set(current.taskIds)
          if (taskId) {
            taskIds.delete(taskId)
          }
          const all = taskId ? current.all : false
          return taskIds.size === 0 && !all ? null : { sessionId, taskIds, all }
        })
      })
  }

  return (
    <>
      {props.backgroundTasks.show ? (
        <NativeChatBackgroundTasksStatus
          isVisible={props.isVisible}
          tasks={props.backgroundTasks.tasks}
          settledTasks={props.backgroundTasks.settledTasks}
          {...(props.backgroundTasks.children
            ? { childViews: props.backgroundTasks.children, childRowContext }
            : {})}
          indicatorActive={props.backgroundTasks.isMonitoring}
          supportsTaskStop={props.backgroundTasks.supportsStop}
          supportsStopAll={props.backgroundTasks.supportsStopAll}
          stoppingTaskIds={stoppingTaskIds}
          stoppingAll={activeStopping?.all ?? false}
          expanded={
            expanded?.sessionId === props.sessionId
              ? expanded.expanded
              : props.startsExpanded === true
          }
          onExpandedChange={(value) => setExpanded({ sessionId: props.sessionId, expanded: value })}
          onStop={onStop}
        />
      ) : props.startsExpanded ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          {translate(
            'components.native-chat.sidePanel.noBackground',
            'Nothing is running in the background.'
          )}
        </p>
      ) : null}
    </>
  )
}
