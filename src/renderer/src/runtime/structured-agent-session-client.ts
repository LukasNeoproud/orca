import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import type {
  AgentSessionStatusEvent,
  AgentSessionSubscribeEvent
} from '../../../shared/agent-session-wire'
import { getRuntimeEnvironmentRevision } from './runtime-environment-revision'
import {
  AGENT_SESSION_REWIND_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'
import {
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability,
  type RuntimeClientTarget
} from './runtime-rpc-client'

export async function callStructuredAgentSession<TResult>(
  target: RuntimeClientTarget,
  method: string,
  params?: unknown
): Promise<TResult> {
  if (target.kind === 'environment') {
    const capability =
      method === 'agentSession.rewind'
        ? AGENT_SESSION_REWIND_RUNTIME_CAPABILITY
        : method === 'agentSession.topicIndex' || method === 'agentSession.writeTopicIndex'
          ? STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY
          : null
    if (
      capability &&
      !(await runtimeEnvironmentSupportsCapability(target.environmentId, capability))
    ) {
      throw new Error(
        capability === AGENT_SESSION_REWIND_RUNTIME_CAPABILITY
          ? 'Rewinding requires a newer Orca server. Update the server and try again.'
          : 'Topics require a newer Orca server. Update the server and try again.'
      )
    }
  }
  return method === 'agentSession.conversationCommand'
    ? callRuntimeRpc<TResult>(target, method, params, { timeoutMs: 195_000 })
    : callRuntimeRpc<TResult>(target, method, params)
}

async function subscribeStructuredAgentSessionMethod<TEvent>(
  target: RuntimeClientTarget,
  method: string,
  params: unknown,
  onEvent: (event: TEvent) => void,
  onError: (error: unknown) => void,
  onClose: () => void
): Promise<{ unsubscribe: () => void }> {
  const onResponse = (response: RuntimeRpcResponse<unknown>): void => {
    if (!response.ok) {
      onError(response.error)
      return
    }
    onEvent(response.result as TEvent)
  }
  if (target.kind === 'local') {
    return window.api.runtime.subscribe({ method, params }, onResponse)
  }
  return window.api.runtimeEnvironments.subscribe(
    {
      selector: target.environmentId,
      method,
      params,
      timeoutMs: 15_000,
      expectedEnvironmentPairingRevision: getRuntimeEnvironmentRevision(target.environmentId)
    },
    { onResponse, onError, onClose }
  )
}

export function subscribeStructuredAgentSession(
  target: RuntimeClientTarget,
  params: unknown,
  onEvent: (event: AgentSessionSubscribeEvent) => void,
  onError: (error: unknown) => void,
  onClose: () => void
): Promise<{ unsubscribe: () => void }> {
  return subscribeStructuredAgentSessionMethod(
    target,
    'agentSession.subscribe',
    params,
    onEvent,
    onError,
    onClose
  )
}

/** Every structured session's projected status on one runtime, as the host publishes it. */
export function subscribeStructuredAgentSessionStatus(
  target: RuntimeClientTarget,
  onEvent: (event: AgentSessionStatusEvent) => void,
  onError: (error: unknown) => void,
  onClose: () => void
): Promise<{ unsubscribe: () => void }> {
  return subscribeStructuredAgentSessionMethod(
    target,
    'agentSession.subscribeStatus',
    {},
    onEvent,
    onError,
    onClose
  )
}
