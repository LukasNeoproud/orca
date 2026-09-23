import { useSyncExternalStore } from 'react'
import type { AgentSessionBranchAnchor } from '../../../src/shared/agent-session-branch'

export type MobileConversationAnchorRequest = AgentSessionBranchAnchor & { sequence: number }

const requests = new Map<string, MobileConversationAnchorRequest>()
const listeners = new Set<() => void>()
let sequence = 0

function key(hostId: string, sessionId: string): string {
  return JSON.stringify([hostId, sessionId])
}

export function requestMobileConversationAnchor(
  hostId: string,
  sessionId: string,
  anchor: AgentSessionBranchAnchor
): void {
  requests.set(key(hostId, sessionId), { ...anchor, sequence: ++sequence })
  while (requests.size > 64) {
    requests.delete(requests.keys().next().value!)
  }
  listeners.forEach((listener) => listener())
}

export function useMobileConversationAnchorRequest(
  hostId: string,
  sessionId: string | null
): MobileConversationAnchorRequest | null {
  const requestKey = sessionId ? key(hostId, sessionId) : ''
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => requests.get(requestKey) ?? null,
    () => null
  )
}

export function consumeMobileConversationAnchor(
  hostId: string,
  sessionId: string,
  requestSequence: number
): void {
  const requestKey = key(hostId, sessionId)
  if (requests.get(requestKey)?.sequence === requestSequence) {
    requests.delete(requestKey)
    listeners.forEach((listener) => listener())
  }
}
