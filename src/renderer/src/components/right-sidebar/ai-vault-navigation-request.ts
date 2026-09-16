import { useSyncExternalStore } from 'react'
import type { ExecutionHostId } from '../../../../shared/execution-host'

export type AiVaultWorkspaceNavigationRequest = {
  id: number
  workspaceId: string
  executionHostId: ExecutionHostId
}

let nextRequestId = 1
let pendingRequest: AiVaultWorkspaceNavigationRequest | null = null
const listeners = new Set<() => void>()

export function requestAiVaultWorkspaceHistory(
  workspaceId: string,
  executionHostId: ExecutionHostId
): void {
  pendingRequest = { id: nextRequestId++, workspaceId, executionHostId }
  for (const listener of listeners) {
    listener()
  }
}

export function useAiVaultWorkspaceNavigationRequest(): AiVaultWorkspaceNavigationRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pendingRequest,
    () => pendingRequest
  )
}

export function consumeAiVaultWorkspaceNavigationRequest(id: number): void {
  if (pendingRequest?.id === id) {
    pendingRequest = null
  }
}

export function resetAiVaultWorkspaceNavigationRequestForTests(): void {
  nextRequestId = 1
  pendingRequest = null
}
