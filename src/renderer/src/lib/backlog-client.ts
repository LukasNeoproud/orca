import type { BacklogSnapshot, BacklogTask } from '../../../shared/backlog-types'
import { backlogRouteKey, callBacklog, resolveBacklogRoute, type BacklogRoute } from './backlog-rpc'
import { createBrowserUuid } from '@/lib/browser-uuid'

export { openBacklogBoard } from './backlog-board-client'

type Subscription = {
  route: BacklogRoute
  leaseId: string
  listeners: Set<(snapshot: BacklogSnapshot) => void>
  snapshot: BacklogSnapshot
  timer?: ReturnType<typeof setTimeout>
  running: boolean
  refreshRequested: boolean
}

const subscriptions = new Map<string, Subscription>()

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function poll(entry: Subscription): Promise<void> {
  if (entry.running) {
    entry.refreshRequested = true
    return
  }
  if (!entry.listeners.size) {
    return
  }
  entry.running = true
  clearTimeout(entry.timer)
  try {
    const snapshot = await callBacklog<BacklogSnapshot>(entry.route, 'snapshot', {
      leaseId: entry.leaseId
    })
    if (
      !snapshot ||
      !['loading', 'ready', 'error'].includes(snapshot.state) ||
      !Array.isArray(snapshot.tasks)
    ) {
      throw new Error('Backlog.md returned an invalid snapshot.')
    }
    entry.snapshot = snapshot
  } catch (error) {
    entry.snapshot = {
      state: 'error',
      tasks: entry.snapshot.tasks,
      stale: true,
      error: message(error)
    }
  } finally {
    entry.running = false
  }
  if (!entry.listeners.size) {
    // A pending acquire may finish after the final panel has unmounted.
    void callBacklog(entry.route, 'releaseSnapshot', { leaseId: entry.leaseId }).catch(() => {})
    return
  }
  for (const listener of entry.listeners) {
    listener(entry.snapshot)
  }
  const delay = entry.refreshRequested ? 0 : entry.snapshot.state === 'error' ? 5_000 : 1_000
  entry.refreshRequested = false
  entry.timer = setTimeout(() => void poll(entry), delay)
}

export function subscribeBacklog(
  workspaceId: string,
  listener: (snapshot: BacklogSnapshot) => void
): () => void {
  let route: BacklogRoute
  try {
    route = resolveBacklogRoute(workspaceId)
  } catch (error) {
    listener({ state: 'error', tasks: [], error: message(error) })
    return () => {}
  }
  const key = backlogRouteKey(route)
  let entry = subscriptions.get(key)
  if (!entry) {
    entry = {
      route,
      leaseId: createBrowserUuid(),
      listeners: new Set(),
      snapshot: { state: 'loading', tasks: [] },
      running: false,
      refreshRequested: false
    }
    subscriptions.set(key, entry)
  }
  const current = entry
  current.listeners.add(listener)
  listener(current.snapshot)
  if (current.listeners.size === 1) {
    void poll(current)
  }
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    current.listeners.delete(listener)
    if (current.listeners.size) {
      return
    }
    clearTimeout(current.timer)
    if (subscriptions.get(key) === current) {
      subscriptions.delete(key)
    }
    void callBacklog(current.route, 'releaseSnapshot', { leaseId: current.leaseId }).catch(() => {})
  }
}

export function refreshBacklog(workspaceId: string): void {
  for (const entry of subscriptions.values()) {
    if (entry.route.workspaceId !== workspaceId) {
      continue
    }
    void callBacklog(entry.route, 'releaseSnapshot', { leaseId: entry.leaseId })
      .catch(() => {})
      .finally(() => void poll(entry))
  }
}

export function readBacklogTask(workspaceId: string, taskId: string): Promise<BacklogTask> {
  return callBacklog(resolveBacklogRoute(workspaceId), 'task', { taskId })
}
