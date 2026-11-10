import type {
  ClaudeSessionControlReply,
  ClaudeSessionControlRequest
} from '../../../shared/claude-session-control'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY } from '../../../shared/structured-agent-session-surface-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import {
  ensureLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from './local-runtime-capabilities'

/** A side question is a model call; everything else answers well inside this. */
const CLAUDE_CONTROL_TIMEOUT_MS = 190_000

/** Whether the host answers `agentSession.claudeControl`; an unknown or failed probe reads as no. */
export async function supportsClaudeSessionControl(target: RuntimeClientTarget): Promise<boolean> {
  try {
    if (target.kind === 'local') {
      const capabilities =
        readLocalRuntimeCapabilitiesOrUnknown() ?? (await ensureLocalRuntimeCapabilities())
      return capabilities?.includes(AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY) === true
    }
    return await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

/** Throws `claude_session_not_running` when the chat has no running CLI to ask. */
export function requestClaudeSessionControl<K extends ClaudeSessionControlRequest['kind']>(
  target: RuntimeClientTarget,
  sessionId: string,
  request: Extract<ClaudeSessionControlRequest, { kind: K }>
): Promise<ClaudeSessionControlReply[K]> {
  return callRuntimeRpc<{ reply: ClaudeSessionControlReply[K] }>(
    target,
    'agentSession.claudeControl',
    { sessionId, request },
    { timeoutMs: CLAUDE_CONTROL_TIMEOUT_MS }
  ).then((result) => result.reply)
}

export function isClaudeSessionNotRunning(error: unknown): boolean {
  return error instanceof Error && error.message.includes('claude_session_not_running')
}
