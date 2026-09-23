import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { callConversationRuntimeFeature } from '@/lib/conversation-runtime-rpc'
import { AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'

export type AgentContextTerminalSurfaceRequest = {
  requestId: string
  source: {
    paneKey: string
    providerSessionId: string
    sourceGeneration: string
  }
  mode: 'compacted' | 'fresh'
  candidate?: { providerSessionId: string; transcriptPath?: string }
}

type AgentContextTerminalSurfaceSource = Pick<
  AgentContextTerminalSurfaceRequest['source'],
  'paneKey' | 'providerSessionId'
>

export function readAgentContextTerminalSurface(
  target: RuntimeClientTarget,
  source: AgentContextTerminalSurfaceSource
): Promise<AgentContextTerminalSurfaceRequest | null> {
  return call<AgentContextTerminalSurfaceRequest | null>(target, 'surface', source)
}

export function claimAgentContextTerminalSurface(
  target: RuntimeClientTarget,
  input: AgentContextTerminalSurfaceSource & { requestId: string }
): Promise<{ claimId: string }> {
  return call<{ claimId: string }>(target, 'claimSurface', input)
}

export function completeAgentContextTerminalSurface(
  target: RuntimeClientTarget,
  input: {
    requestId: string
    claimId: string
    result: { status: 'completed' } | { status: 'failed'; error: string }
  }
): Promise<void> {
  return call<void>(target, 'completeSurface', input)
}

function call<T>(target: RuntimeClientTarget, action: string, params: unknown): Promise<T> {
  return callConversationRuntimeFeature(
    target,
    AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
    'Update the owning Orca runtime to use agent context transitions.',
    `agentContext.${action}`,
    params
  )
}
