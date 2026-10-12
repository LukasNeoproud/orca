import {
  isAgentSessionHandleProvider,
  type AgentSessionHandleProvider
} from '../../../src/shared/agent-session-provider-handle'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'

export type MobileAgentHistoryOpenPlan =
  | { kind: 'reveal'; sessionId: string; worktreeId: string }
  | { kind: 'structured-resume'; agent: AgentSessionHandleProvider }
  | { kind: 'terminal-resume' }
  | { kind: 'blocked'; message: string }

export function resolveMobileAgentHistoryOpenPlan(
  session: Pick<AiVaultSession, 'agent' | 'structuredSession'>,
  hostCapabilities: readonly string[]
): MobileAgentHistoryOpenPlan {
  const capabilities = new Set(hostCapabilities)
  const structured = session.structuredSession
  if (structured) {
    if (!capabilities.has(STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY)) {
      return {
        kind: 'blocked',
        message: "This chat can't be reopened until Orca is updated."
      }
    }
    return {
      kind: 'reveal',
      sessionId: structured.sessionId,
      worktreeId: structured.workspaceId
    }
  }

  // A structured-capable host predating ownership-safe reveal can expose a history row without
  // telling mobile that its provider session already has a writer.
  if (
    capabilities.has(STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY) &&
    !capabilities.has(STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY)
  ) {
    return {
      kind: 'blocked',
      message: 'Update Orca on this host before resuming agent session history.'
    }
  }

  if (
    isAgentSessionHandleProvider(session.agent) &&
    capabilities.has(STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY)
  ) {
    return { kind: 'structured-resume', agent: session.agent }
  }
  return { kind: 'terminal-resume' }
}

export function readMobileAgentHistoryHostCapabilities(status: unknown): string[] {
  if (!status || typeof status !== 'object') {
    return []
  }
  const capabilities = (status as { capabilities?: unknown }).capabilities
  return Array.isArray(capabilities)
    ? capabilities.filter((capability): capability is string => typeof capability === 'string')
    : []
}
