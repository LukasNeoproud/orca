import type { AgentSessionBranchPrepareParams } from '../../../src/shared/agent-session-branch'

const MAX_PENDING_INTENTS = 32
const pendingIntents = new Map<string, AgentSessionBranchPrepareParams>()

export function readMobileConversationBranchIntent(
  key: string
): AgentSessionBranchPrepareParams | null {
  const intent = pendingIntents.get(key) ?? null
  if (intent) {
    pendingIntents.delete(key)
    pendingIntents.set(key, intent)
  }
  return intent
}

export function retainMobileConversationBranchIntent(
  key: string,
  create: () => AgentSessionBranchPrepareParams
): AgentSessionBranchPrepareParams {
  const existing = readMobileConversationBranchIntent(key)
  if (existing) {
    return existing
  }
  const intent = create()
  pendingIntents.set(key, intent)
  while (pendingIntents.size > MAX_PENDING_INTENTS) {
    pendingIntents.delete(pendingIntents.keys().next().value!)
  }
  return intent
}

export function resolveMobileConversationBranchIntent(key: string, branchId: string): void {
  if (pendingIntents.get(key)?.branchId === branchId) {
    pendingIntents.delete(key)
  }
}
