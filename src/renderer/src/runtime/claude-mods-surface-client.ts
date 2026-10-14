import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../shared/claude-mods-surface'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { AGENT_SESSION_CLAUDE_MODS_RUNTIME_CAPABILITY } from '../../../shared/structured-agent-session-surface-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import { subscribeRuntimeRpc } from './runtime-rpc-subscribe'
import {
  ensureLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from './local-runtime-capabilities'

/** A mod's press or redraw answers in milliseconds; past this the mod is stuck, not slow. */
const CLAUDE_MODS_REQUEST_TIMEOUT_MS = 12_000

/** Whether the host forwards Claude Code mods' surface; an unknown or failed probe reads as no. */
export async function supportsClaudeMods(target: RuntimeClientTarget): Promise<boolean> {
  try {
    if (target.kind === 'local') {
      const capabilities =
        readLocalRuntimeCapabilitiesOrUnknown() ?? (await ensureLocalRuntimeCapabilities())
      return capabilities?.includes(AGENT_SESSION_CLAUDE_MODS_RUNTIME_CAPABILITY) === true
    }
    return await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      AGENT_SESSION_CLAUDE_MODS_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

export function requestClaudeMods(
  target: RuntimeClientTarget,
  sessionId: string,
  subtype: ClaudeModsRequestSubtype,
  fields: Record<string, unknown>
): Promise<unknown> {
  return callRuntimeRpc<{ response: unknown }>(
    target,
    'agentSession.claudeModsRequest',
    { sessionId, subtype, fields },
    { timeoutMs: CLAUDE_MODS_REQUEST_TIMEOUT_MS, suppressFeatureInteraction: true }
  ).then((result) => result.response)
}

export function subscribeClaudeMods(
  target: RuntimeClientTarget,
  sessionId: string,
  handlers: {
    onEvent: (event: ClaudeModsSurfaceEvent) => void
    onError: (error: unknown) => void
    onClose: () => void
  }
): Promise<{ unsubscribe: () => void }> {
  return subscribeRuntimeRpc(
    target,
    'agentSession.claudeModsSubscribe',
    { sessionId },
    {
      onEvent: (result) => {
        if (typeof result === 'object' && result !== null && 'type' in result) {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the host emits only ClaudeModsSurfaceEvent frames on this method; consumers switch on `type` and ignore unknown kinds.
          handlers.onEvent(result as ClaudeModsSurfaceEvent)
        }
      },
      onError: handlers.onError,
      onClose: handlers.onClose
    }
  )
}
