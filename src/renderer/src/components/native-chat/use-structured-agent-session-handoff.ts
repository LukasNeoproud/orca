import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentSessionHandoffRequest,
  AgentSessionHandoffResult,
  AgentSessionHandoffStatus,
  AgentSessionMutationResult
} from '../../../../shared/agent-session-wire'
import { structuredAgentSessionPayloadFingerprint } from '../../../../shared/structured-agent-session-mutation'
import { agentSessionRefusalOperationState } from '../../../../shared/agent-session-refusal-retry'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import { publishStructuredHandoff } from '@/runtime/structured-agent-session-handoff-store'
import { structuredSessionOperationId } from './use-structured-agent-session-outbox'

type Input = {
  sessionId: string
  target: RuntimeClientTarget
  isVisible: boolean
  fence: number | null
  handoff: AgentSessionHandoffStatus | null
}
type LocalStatus = {
  sessionId: string
  event: AgentSessionHandoffStatus | null
  status: AgentSessionHandoffStatus
  fence: number | null
}

export function useStructuredAgentSessionHandoff(
  input: Omit<Input, 'fence' | 'handoff'>,
  state: Pick<Input, 'fence' | 'handoff'>
) {
  const args = { ...input, fence: state.fence, handoff: state.handoff }
  const latest = useRef(args)
  latest.current = args
  const [local, setLocal] = useState<LocalStatus | null>(null)
  const [error, setError] = useState<{ sessionId: string; message: string } | null>(null)
  const [uncertain, setUncertain] = useState<{
    sessionId: string
    event: AgentSessionHandoffStatus | null
  } | null>(null)
  const [pendingSession, setPendingSession] = useState<string | null>(null)
  const pending = useRef<{ sessionId: string } | null>(null)
  const generation = useRef(0)
  const operations = useRef(new Map<string, string>())
  const currentLocal =
    local?.sessionId === args.sessionId && local.event === args.handoff ? local : null
  const status = currentLocal?.status ?? args.handoff
  const fence = Math.max(args.fence ?? 0, currentLocal?.fence ?? 0) || null

  useEffect(() => {
    if (!args.isVisible || args.handoff) {
      return
    }
    const readGeneration = generation.current
    let stale = false
    void callStructuredAgentSession<AgentSessionHandoffStatus>(
      args.target,
      'agentSession.handoffStatus',
      {
        sessionId: args.sessionId
      }
    )
      .then((result) => {
        if (
          !stale &&
          readGeneration === generation.current &&
          result?.owner &&
          !latest.current.handoff &&
          pending.current?.sessionId !== args.sessionId
        ) {
          setLocal({ sessionId: args.sessionId, event: null, status: result, fence: args.fence })
        }
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [args.sessionId, args.target, args.isVisible, args.handoff, args.fence])

  useEffect(() => {
    if (status && fence !== null) {
      publishStructuredHandoff({ sessionId: args.sessionId, fence, status })
    }
  }, [args.sessionId, fence, status])

  const requestHandoff = useCallback(
    async (
      direction: AgentSessionHandoffRequest['direction'],
      mode: AgentSessionHandoffRequest['mode'] = 'after-turn',
      action: NonNullable<AgentSessionHandoffRequest['action']> = 'start'
    ): Promise<boolean> => {
      if (
        fence === null ||
        pending.current?.sessionId === args.sessionId ||
        latest.current.sessionId !== args.sessionId
      ) {
        return false
      }
      generation.current += 1
      const attempt = { sessionId: args.sessionId }
      pending.current = attempt
      setPendingSession(args.sessionId)
      const fields = { direction, mode, action }
      const key = `${args.sessionId}:${JSON.stringify(fields)}`
      const clientOperationId =
        (action === 'retry' ? status?.operationId : null) ??
        operations.current.get(key) ??
        structuredSessionOperationId()
      operations.current.set(key, clientOperationId)
      const event = args.handoff
      try {
        const result = await callStructuredAgentSession<
          AgentSessionMutationResult<AgentSessionHandoffResult>
        >(args.target, 'agentSession.requestHandoff', {
          envelope: {
            sessionId: args.sessionId,
            expectedRuntimeFence: fence,
            clientOperationId,
            payloadFingerprint: structuredAgentSessionPayloadFingerprint({
              method: 'agentSession.requestHandoff',
              sessionId: args.sessionId,
              fields
            })
          },
          ...fields
        })
        if (latest.current.sessionId !== args.sessionId) {
          return false
        }
        if (!result.ok) {
          if (
            agentSessionRefusalOperationState(
              'agentSession.requestHandoff',
              result.refusal.code
            ) === 'settled-rejected'
          ) {
            operations.current.delete(key)
          }
          setError({ sessionId: args.sessionId, message: result.refusal.message })
          return false
        }
        operations.current.delete(key)
        if (latest.current.handoff === event && result.fence >= (latest.current.fence ?? 0)) {
          setLocal({
            sessionId: args.sessionId,
            event,
            status: result.value.status,
            fence: result.fence
          })
        }
        setUncertain(null)
        setError(null)
        return true
      } catch (failure) {
        if (latest.current.sessionId === args.sessionId) {
          setError({
            sessionId: args.sessionId,
            message: failure instanceof Error ? failure.message : String(failure)
          })
          setUncertain({ sessionId: args.sessionId, event })
          const proof = await callStructuredAgentSession<AgentSessionHandoffStatus>(
            args.target,
            'agentSession.handoffStatus',
            { sessionId: args.sessionId }
          ).catch(() => null)
          if (
            proof?.owner &&
            latest.current.sessionId === args.sessionId &&
            latest.current.handoff === event
          ) {
            setLocal({
              sessionId: args.sessionId,
              event,
              status: proof,
              fence: latest.current.fence
            })
            setUncertain(null)
          }
        }
        return false
      } finally {
        if (pending.current === attempt) {
          pending.current = null
          setPendingSession(null)
        }
      }
    },
    [args.sessionId, args.target, args.handoff, fence, status?.operationId]
  )
  return {
    handoff: status,
    requestHandoff,
    canSend:
      fence === args.fence &&
      !(uncertain?.sessionId === args.sessionId && uncertain.event === args.handoff) &&
      pendingSession !== args.sessionId &&
      (!status || (status.owner === 'native' && status.phase === 'idle')),
    error: error?.sessionId === args.sessionId ? error.message : null
  }
}
