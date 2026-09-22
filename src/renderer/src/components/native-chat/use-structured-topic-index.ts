import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  emptyStructuredTopicIndex,
  type StructuredTopicIndex
} from '../../../../shared/structured-topic-index'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'

type TopicState = {
  scope: string
  index: StructuredTopicIndex
  error: string | null
  ready: boolean
}

function emptyState(scope: string, sessionId: string): TopicState {
  return { scope, index: emptyStructuredTopicIndex(sessionId), error: null, ready: false }
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Topic index unavailable'
}

export function useStructuredTopicIndex(
  sessionId: string,
  target: RuntimeClientTarget,
  visible: boolean
) {
  const scope = JSON.stringify([sessionId, target])
  const [state, setState] = useState(() => emptyState(scope, sessionId))
  const generation = useRef(0)
  const targetRef = useRef(target)
  const activeScope = useRef(scope)
  targetRef.current = target
  activeScope.current = scope
  const current = state.scope === scope ? state : emptyState(scope, sessionId)

  const read = useCallback(
    async (reset: boolean): Promise<void> => {
      if (activeScope.current !== scope) {
        return
      }
      const request = ++generation.current
      setState((value) =>
        reset || value.scope !== scope
          ? emptyState(scope, sessionId)
          : { ...value, ready: false, error: null }
      )
      try {
        const result = await callStructuredAgentSession<{ index: StructuredTopicIndex }>(
          targetRef.current,
          'agentSession.topicIndex',
          { sessionId }
        )
        if (generation.current === request && activeScope.current === scope) {
          setState({ scope, index: result.index, error: null, ready: true })
        }
      } catch (failure) {
        if (generation.current === request && activeScope.current === scope) {
          setState((value) => ({
            ...(value.scope === scope ? value : emptyState(scope, sessionId)),
            error: failureMessage(failure),
            ready: false
          }))
        }
      }
    },
    [scope, sessionId]
  )

  useEffect(() => {
    generation.current += 1
    setState(emptyState(scope, sessionId))
    if (visible) {
      void read(true)
    }
    return () => {
      generation.current += 1
    }
  }, [read, scope, sessionId, visible])

  const refresh = useCallback(() => read(false), [read])
  const save = useCallback(
    async (index: StructuredTopicIndex): Promise<StructuredTopicIndex> => {
      if (!current.ready || activeScope.current !== scope) {
        throw new Error('agent_session_topic_index_not_ready')
      }
      const request = ++generation.current
      try {
        const result = await callStructuredAgentSession<{ index: StructuredTopicIndex }>(
          targetRef.current,
          'agentSession.writeTopicIndex',
          { sessionId, expectedRevision: current.index.revision, index }
        )
        if (generation.current === request && activeScope.current === scope) {
          setState({ scope, index: result.index, error: null, ready: true })
        }
        return result.index
      } catch (failure) {
        if (generation.current === request && activeScope.current === scope) {
          setState((value) =>
            value.scope === scope
              ? { ...value, error: failureMessage(failure), ready: false }
              : value
          )
        }
        throw failure
      }
    },
    [current.index.revision, current.ready, scope, sessionId]
  )
  return { ...current, refresh, save }
}
