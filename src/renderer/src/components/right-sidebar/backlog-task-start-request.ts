import { useSyncExternalStore } from 'react'
import { resolveBacklogRoute, type BacklogRoute } from '@/lib/backlog-rpc'
import type { BacklogTask } from '../../../../shared/backlog-types'

type BacklogTaskStartRequest = { route: BacklogRoute; task: BacklogTask }
let request: BacklogTaskStartRequest | null = null
const listeners = new Set<() => void>()

export function requestBacklogTaskStart(workspaceId: string, task: BacklogTask): void {
  if (request) {
    return
  }
  request = { route: resolveBacklogRoute(workspaceId), task }
  for (const listener of listeners) {
    listener()
  }
}

export function closeBacklogTaskStart(): void {
  request = null
  for (const listener of listeners) {
    listener()
  }
}

export function useBacklogTaskStartRequest(): BacklogTaskStartRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => request,
    () => request
  )
}
