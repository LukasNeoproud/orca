import { useCallback, type RefObject } from 'react'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
import type { RpcClient } from '../transport/rpc-client'
import {
  requestStructuredAgentSessionMutation,
  retainStructuredSessionOperationId,
  type StructuredAgentSessionMutationResult
} from './mobile-structured-agent-session-rpc'

export function useMobileStructuredSessionMutation(args: {
  client: RpcClient | null
  enabled: boolean
  sessionId: string | null
  sessionKey: string
  stateRef: RefObject<StructuredAgentSessionState>
  operationIds: RefObject<Map<string, string>>
  onSendError: (message: string) => void
}) {
  const { client, enabled, sessionId, sessionKey, stateRef, operationIds, onSendError } = args
  return useCallback(
    async <TValue>(
      method: string,
      fingerprintMethod: string,
      fields: Record<string, unknown>
    ): Promise<StructuredAgentSessionMutationResult<TValue>> => {
      const current = stateRef.current
      if (!client || !sessionId || !enabled || current.fence === null) {
        return { status: 'rejected' }
      }
      const targetFence = current.fence
      const key = `${sessionKey}:${fingerprintMethod}:${JSON.stringify(fields)}`
      const clientOperationId = retainStructuredSessionOperationId(
        operationIds.current,
        key,
        operationIds.current.get(key)
      )
      const result = await requestStructuredAgentSessionMutation<TValue>({
        client,
        method,
        fingerprintMethod,
        sessionId,
        expectedRuntimeFence: targetFence,
        fields,
        clientOperationId
      })
      operationIds.current.delete(key)
      if (result.status === 'accepted') {
        return {
          status: 'accepted',
          value: result.value,
          sameFence: stateRef.current.fence === targetFence
        }
      }
      if (result.status === 'unknown') {
        // Only sends opt into retryUnknown; other plans need a fresh id after inspection.
        return result
      }
      onSendError(result.message)
      return { status: 'rejected' }
    },
    [client, enabled, onSendError, operationIds, sessionId, sessionKey, stateRef]
  )
}
