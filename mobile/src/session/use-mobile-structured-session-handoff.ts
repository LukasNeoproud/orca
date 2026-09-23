import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentSessionHandoffAction,
  AgentSessionHandoffDirection,
  AgentSessionHandoffMode,
  AgentSessionHandoffResult,
  AgentSessionHandoffStatus
} from '../../../src/shared/agent-session-wire'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
import type { RpcClient } from '../transport/rpc-client'
import {
  callAgentSession,
  requestStructuredAgentSessionMutation,
  structuredSessionOperationId
} from './mobile-structured-agent-session-rpc'

export function useMobileStructuredSessionHandoff(args: {
  client: RpcClient | null
  connected: boolean
  enabled: boolean
  sessionId: string | null
  sessionKey: string
  state: StructuredAgentSessionState
  stateRef: { readonly current: StructuredAgentSessionState }
}) {
  const { client, connected, enabled, sessionId, sessionKey, state, stateRef } = args
  const [local, setLocal] = useState<{
    key: string
    event: AgentSessionHandoffStatus | null
    status: AgentSessionHandoffStatus
    awaitingEvent: boolean
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const operationIds = useRef(new Map<string, string>())
  const status =
    local?.key === sessionKey && local.event === state.handoff ? local.status : state.handoff

  useEffect(() => {
    setLocal(null)
    setPending(false)
    setUncertain(false)
    setError(null)
    pendingRef.current = false
    operationIds.current.clear()
  }, [sessionKey])

  useEffect(() => {
    if (state.handoff !== null) {
      setUncertain(false)
    }
  }, [state.handoff])

  useEffect(() => {
    if (!client || !connected || !enabled || !sessionId || state.handoff) {
      return
    }
    let active = true
    void callAgentSession<AgentSessionHandoffStatus>(client, 'agentSession.handoffStatus', {
      sessionId
    })
      .then((result) => {
        if (active && result?.owner && stateRef.current.handoff === null) {
          setLocal({ key: sessionKey, event: null, status: result, awaitingEvent: false })
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [client, connected, enabled, sessionId, sessionKey, state.handoff, stateRef])

  const request = useCallback(
    async (
      direction: AgentSessionHandoffDirection,
      mode: AgentSessionHandoffMode,
      action: AgentSessionHandoffAction = 'start'
    ): Promise<boolean> => {
      const fence = stateRef.current.fence
      if (
        !client ||
        !connected ||
        !enabled ||
        !sessionId ||
        fence === null ||
        pendingRef.current ||
        uncertain
      ) {
        return false
      }
      pendingRef.current = true
      setPending(true)
      setError(null)
      const fields = { direction, mode, action }
      const operationKey = `${sessionKey}:${JSON.stringify(fields)}`
      const operationId =
        (action === 'retry' ? status?.operationId : null) ??
        operationIds.current.get(operationKey) ??
        structuredSessionOperationId()
      operationIds.current.set(operationKey, operationId)
      const event = stateRef.current.handoff
      try {
        const result = await requestStructuredAgentSessionMutation<AgentSessionHandoffResult>({
          client,
          method: 'agentSession.requestHandoff',
          fingerprintMethod: 'agentSession.requestHandoff',
          sessionId,
          expectedRuntimeFence: fence,
          fields,
          clientOperationId: operationId
        })
        if (result.status === 'accepted') {
          operationIds.current.delete(operationKey)
          setLocal({ key: sessionKey, event, status: result.value.status, awaitingEvent: true })
          setUncertain(false)
          return true
        }
        if (result.status === 'unknown') {
          setUncertain(true)
          setError('Switch outcome is unconfirmed. Check the host before requesting it again.')
          const proof = await callAgentSession<AgentSessionHandoffStatus>(
            client,
            'agentSession.handoffStatus',
            { sessionId }
          ).catch(() => null)
          if (
            proof?.owner &&
            stateRef.current.handoff === event &&
            JSON.stringify(proof) !== JSON.stringify(event)
          ) {
            setLocal({ key: sessionKey, event, status: proof, awaitingEvent: true })
            setUncertain(false)
            setError(null)
          }
          return false
        }
        if (result.status === 'refused') {
          operationIds.current.delete(operationKey)
        }
        setError(result.message)
        return false
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [client, connected, enabled, sessionId, sessionKey, stateRef, status?.operationId, uncertain]
  )

  return {
    status,
    pending,
    uncertain,
    error,
    request,
    canSend:
      !pending &&
      !uncertain &&
      !(local?.key === sessionKey && local.event === state.handoff && local.awaitingEvent) &&
      (!status || (status.owner === 'native' && status.phase === 'idle'))
  }
}
