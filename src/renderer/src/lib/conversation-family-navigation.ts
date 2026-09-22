import { useSyncExternalStore } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { AgentSessionBranchAnchor } from '../../../shared/agent-session-branch'
import type { AgentSessionExecutionLocation } from '../../../shared/agent-session-record'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import {
  activateStructuredConversation,
  type WorkspaceConversationRoute
} from './workspace-conversation-activation'

export type ConversationAnchorRequest = AgentSessionBranchAnchor & { sequence: number }
const requests = new Map<string, ConversationAnchorRequest>()
const listeners = new Set<() => void>()
let sequence = 0

export function conversationViewKey(target: RuntimeClientTarget, sessionId: string): string {
  return JSON.stringify([
    target.kind,
    target.kind === 'environment' ? target.environmentId : null,
    sessionId
  ])
}

export function conversationLocationRoute(
  target: RuntimeClientTarget,
  location: AgentSessionExecutionLocation
): WorkspaceConversationRoute {
  return {
    workspaceId: location.workspaceId,
    executionHostId:
      target.kind === 'environment' && location.executionHostId === 'local'
        ? toRuntimeExecutionHostId(target.environmentId)
        : location.executionHostId,
    runtimeEnvironmentId: target.kind === 'environment' ? target.environmentId : null
  }
}

export async function navigateRelatedConversation(
  target: RuntimeClientTarget,
  sessionId: string,
  location: AgentSessionExecutionLocation,
  anchor?: AgentSessionBranchAnchor
): Promise<void> {
  const outcome = await activateStructuredConversation(
    conversationLocationRoute(target, location),
    sessionId
  )
  if (outcome !== 'activated') {
    throw new Error(
      outcome === 'unverifiable'
        ? 'The conversation owner cannot currently be verified. Reconnect and retry.'
        : 'The conversation or workspace is unavailable.'
    )
  }
  if (anchor) {
    requests.set(conversationViewKey(target, sessionId), { ...anchor, sequence: ++sequence })
    if (requests.size > 128) {
      requests.delete(requests.keys().next().value!)
    }
    listeners.forEach((listener) => listener())
  }
}

export function useConversationAnchorRequest(target: RuntimeClientTarget, sessionId: string) {
  const key = conversationViewKey(target, sessionId)
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => requests.get(key) ?? null,
    () => null
  )
}

export function consumeConversationAnchorRequest(
  target: RuntimeClientTarget,
  sessionId: string,
  requestSequence: number
): void {
  const key = conversationViewKey(target, sessionId)
  if (requests.get(key)?.sequence === requestSequence) {
    requests.delete(key)
    listeners.forEach((listener) => listener())
  }
}
