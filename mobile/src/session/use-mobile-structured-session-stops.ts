import { useCallback } from 'react'
import type { AgentSessionCancelResult } from '../../../src/shared/agent-session-wire'
import { activeStructuredAgentSessionTurnId } from '../../../src/shared/structured-agent-session-projection'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
import type { RpcClient } from '../transport/rpc-client'
import {
  requestStructuredAgentSessionMutation,
  retainStructuredSessionOperationId,
  type StructuredAgentSessionMutate
} from './mobile-structured-agent-session-rpc'

export function useMobileStructuredSessionStops(args: {
  client: RpcClient | null
  connected: boolean
  enabled: boolean
  sessionId: string | null
  sessionKey: string
  stateRef: { readonly current: StructuredAgentSessionState }
  operationIds: Map<string, string>
  mutate: StructuredAgentSessionMutate
  onSendError: (message: string) => void
}): { cancel: () => void; stopBackgroundTask: (taskId?: string) => Promise<boolean> } {
  const {
    client,
    connected,
    enabled,
    sessionId,
    sessionKey,
    stateRef,
    operationIds,
    mutate,
    onSendError
  } = args
  const cancel = useCallback(() => {
    const current = stateRef.current
    const turnId = activeStructuredAgentSessionTurnId(current.items)
    if (!client || !sessionId || !enabled || current.fence === null || !turnId) {
      onSendError('Stop not sent')
      return
    }
    const fields = { turnId }
    const key = `${sessionKey}:agentSession.cancel:${JSON.stringify(fields)}`
    const clientOperationId = retainStructuredSessionOperationId(
      operationIds,
      key,
      operationIds.get(key)
    )
    void requestStructuredAgentSessionMutation<AgentSessionCancelResult>({
      client,
      method: 'agentSession.cancel',
      fingerprintMethod: 'agentSession.cancel',
      sessionId,
      expectedRuntimeFence: current.fence,
      fields,
      clientOperationId
    }).then((result) => {
      if (result.status !== 'unknown') {
        operationIds.delete(key)
      }
      if (result.status === 'unknown') {
        onSendError('Stop unconfirmed — check chat before retrying')
      } else if (result.status === 'refused') {
        onSendError(result.message)
      } else if (result.status === 'failed') {
        onSendError(result.message === 'Request not sent' ? 'Stop not sent' : result.message)
      }
    })
  }, [client, enabled, onSendError, operationIds, sessionId, sessionKey, stateRef])

  const stopBackgroundTask = useCallback(
    (taskId?: string): Promise<boolean> =>
      stopMobileStructuredBackgroundTask({
        taskId,
        state: stateRef.current,
        client,
        connected,
        mutate,
        onSendError
      }),
    [client, connected, mutate, onSendError, stateRef]
  )
  return { cancel, stopBackgroundTask }
}

export async function stopMobileStructuredBackgroundTask(args: {
  taskId?: string
  state: StructuredAgentSessionState
  client: RpcClient | null
  connected: boolean
  mutate: StructuredAgentSessionMutate
  onSendError: (message: string) => void
}): Promise<boolean> {
  const { taskId, state, client, connected, mutate, onSendError } = args
  const tasks = state.backgroundTasks
  if (
    tasks?.state !== 'monitoring' ||
    (taskId && tasks.supportsTaskStop !== true) ||
    !client ||
    !connected
  ) {
    return false
  }
  const result = await mutate<AgentSessionCancelResult>(
    'agentSession.cancel',
    'agentSession.cancel',
    { turnId: 'background-tasks', scope: 'background-tasks', ...(taskId ? { taskId } : {}) }
  )
  if (result.status === 'unknown') {
    onSendError('Background task stop unconfirmed — check chat before retrying')
  }
  return result.status === 'accepted' && result.value.cancelled
}
