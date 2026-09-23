import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentSessionTopicIndexResult } from '../../../src/shared/agent-session-wire'
import { STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import {
  emptyStructuredTopicIndex,
  type StructuredTopicIndex
} from '../../../src/shared/structured-topic-index'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { RpcClient } from '../transport/rpc-client'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import { activeStructuredAgentSessionTurnId } from '../../../src/shared/structured-agent-session-projection'

type TopicState = {
  scope: string
  supported: boolean
  ready: boolean
  index: StructuredTopicIndex
  error: string | null
}

function emptyState(scope: string, sessionId: string): TopicState {
  return {
    scope,
    supported: false,
    ready: false,
    index: emptyStructuredTopicIndex(sessionId),
    error: null
  }
}

export function useMobileStructuredTopicIndex(args: {
  client: RpcClient | null
  connected: boolean
  enabled: boolean
  sessionId: string | null
  sourceIdentity: string
  epoch: string | null
  items: readonly AgentJournalRenderItem[]
}) {
  const { client, connected, enabled, sessionId, sourceIdentity, epoch, items } = args
  const scope = JSON.stringify([sourceIdentity, sessionId])
  const [state, setState] = useState(() => emptyState(scope, sessionId ?? ''))
  const generation = useRef(0)
  const saving = useRef(false)
  const attemptedRefresh = useRef('')
  const current = state.scope === scope ? state : emptyState(scope, sessionId ?? '')

  const refresh = useCallback(async (): Promise<void> => {
    if (!client || !sessionId || !enabled || !connected) {
      return
    }
    const request = generation.current
    try {
      const result = await callAgentSession<AgentSessionTopicIndexResult>(
        client,
        'agentSession.topicIndex',
        { sessionId }
      )
      if (generation.current === request && result.index.sessionId === sessionId) {
        setState({ scope, supported: true, ready: true, index: result.index, error: null })
      }
    } catch (error) {
      if (generation.current === request) {
        setState((value) => ({
          ...(value.scope === scope ? value : emptyState(scope, sessionId)),
          supported: true,
          ready: false,
          error: error instanceof Error ? error.message : 'Topic index unavailable'
        }))
      }
    }
  }, [client, connected, enabled, scope, sessionId])

  useEffect(() => {
    generation.current += 1
    saving.current = false
    setState(emptyState(scope, sessionId ?? ''))
    if (!client || !sessionId || !enabled || !connected) {
      return
    }
    return startRuntimeCapabilityProbe(client, (capabilities) => {
      if (capabilities.includes(STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY)) {
        void refresh()
      }
    })
  }, [client, connected, enabled, refresh, scope, sessionId])

  const save = useCallback(
    async (index: StructuredTopicIndex): Promise<void> => {
      if (!client || !sessionId || !connected || !current.ready || saving.current) {
        return
      }
      saving.current = true
      const request = generation.current
      try {
        const result = await callAgentSession<AgentSessionTopicIndexResult>(
          client,
          'agentSession.writeTopicIndex',
          { sessionId, expectedRevision: current.index.revision, index }
        )
        if (generation.current === request && result.index.sessionId === sessionId) {
          setState({ scope, supported: true, ready: true, index: result.index, error: null })
        }
      } catch (error) {
        if (generation.current === request) {
          setState((value) => ({
            ...value,
            error: error instanceof Error ? error.message : 'Could not save topics'
          }))
          await refresh()
        }
      } finally {
        saving.current = false
      }
    },
    [client, connected, current.index.revision, current.ready, refresh, scope, sessionId]
  )
  const completedAssistantSequence =
    items.findLast((item) => item.body.kind === 'message' && item.body.role === 'assistant')
      ?.sequence ?? 0
  useEffect(() => {
    const durableEnd = current.index.chapters.at(-1)?.end.sequence ?? 0
    if (
      !enabled ||
      !connected ||
      !current.ready ||
      !current.index.automatic ||
      !epoch ||
      activeStructuredAgentSessionTurnId(items) !== null ||
      completedAssistantSequence <= durableEnd
    ) {
      return
    }
    const key = `${scope}:${epoch}:${completedAssistantSequence}:${durableEnd}`
    if (attemptedRefresh.current === key) {
      return
    }
    attemptedRefresh.current = key
    void refresh()
  }, [
    completedAssistantSequence,
    connected,
    current.index,
    current.ready,
    enabled,
    epoch,
    items,
    refresh,
    scope
  ])
  return { ...current, refresh, save }
}
