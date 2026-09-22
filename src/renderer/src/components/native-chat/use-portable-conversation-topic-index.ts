import { useCallback, useEffect, useRef, useState } from 'react'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import {
  emptyStructuredTopicIndex,
  type StructuredTopicAnchor,
  type StructuredTopicIndex
} from '../../../../shared/structured-topic-index'
import { portableConversationSourceSessionId } from '../../../../shared/portable-conversation-branch'
import type {
  PortableConversationTopicAnchors,
  PortableConversationTopicIndexResult
} from '../../../../shared/portable-conversation-topic-index'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  readPortableConversationTopicIndex,
  writePortableConversationTopicIndex
} from '@/lib/portable-conversation-topic-client'

type TopicState = {
  index: StructuredTopicIndex
  anchors: PortableConversationTopicAnchors
  positions: Record<string, StructuredTopicAnchor>
  limited: boolean
  loading: boolean
  ready: boolean
  error: string | null
}
type TopicSnapshot = { key: string; state: TopicState }

function emptyState(source: PortableConversationSource): TopicState {
  return {
    index: emptyStructuredTopicIndex(portableConversationSourceSessionId(source)),
    anchors: {},
    positions: {},
    limited: false,
    loading: false,
    ready: false,
    error: null
  }
}

function topicKey(target: RuntimeClientTarget, source: PortableConversationSource): string {
  return JSON.stringify(['portable-topic-index', target, source])
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Topic index unavailable'
}

export function usePortableConversationTopicIndex({
  target,
  source,
  visible,
  observationKey
}: {
  target: RuntimeClientTarget
  source: PortableConversationSource
  visible: boolean
  observationKey?: string | null
}): {
  index: StructuredTopicIndex
  anchors: PortableConversationTopicAnchors
  positions: Record<string, StructuredTopicAnchor>
  limited: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  save: (index: StructuredTopicIndex) => Promise<void>
} {
  const key = topicKey(target, source)
  const [snapshot, setSnapshot] = useState<TopicSnapshot>(() => ({
    key,
    state: emptyState(source)
  }))
  const state = snapshot.key === key ? snapshot.state : emptyState(source)
  const pollState = useRef(state)
  pollState.current = state
  const requestGeneration = useRef(0)
  const observed = useRef<string | null>(null)
  const currentKey = useRef(key)
  currentKey.current = key
  const update = useCallback(
    (updater: (current: TopicState) => TopicState): void => {
      setSnapshot((current) =>
        current.key === key ? { key, state: updater(current.state) } : current
      )
    },
    [key]
  )
  const read = useCallback(
    async (mode: 'auto' | 'manual'): Promise<void> => {
      if (currentKey.current !== key) {
        return
      }
      const generation = ++requestGeneration.current
      update((current) => ({ ...current, loading: true, error: null }))
      try {
        const result = await readPortableConversationTopicIndex(target, {
          source,
          ...(mode === 'manual' ? { refresh: true } : { autoRefresh: true })
        })
        if (requestGeneration.current === generation) {
          update(() => ({
            ...result,
            positions: result.positions ?? {},
            loading: false,
            ready: true,
            error: null
          }))
        }
      } catch (failure) {
        if (requestGeneration.current === generation) {
          update((current) => ({ ...current, loading: false, error: failureMessage(failure) }))
        }
      }
    },
    [key, source, target, update]
  )
  useEffect(() => {
    requestGeneration.current += 1
    setSnapshot({ key, state: emptyState(source) })
    observed.current = null
    if (visible) {
      void read('auto')
    }
    return () => {
      requestGeneration.current += 1
    }
  }, [key, read, source, visible])
  useEffect(() => {
    if (!visible || !observationKey || !state.ready || state.loading || !state.index.automatic) {
      return
    }
    const observation = JSON.stringify([key, observationKey])
    if (observed.current === observation) {
      return
    }
    observed.current = observation
    void read('auto')
  }, [key, observationKey, read, state.index.automatic, state.loading, state.ready, visible])
  useEffect(() => {
    if (!visible) {
      return
    }
    return installWindowVisibilityTimeoutPoller({
      getDelayMs: () => 15_000,
      run: () => {
        const current = pollState.current
        if (current.ready && !current.loading && current.index.automatic) {
          return read('auto')
        }
        return undefined
      }
    })
  }, [read, visible])
  const save = useCallback(
    async (index: StructuredTopicIndex): Promise<void> => {
      if (currentKey.current !== key) {
        return
      }
      if (!state.ready || state.loading) {
        const failure = new Error('The topic index is not ready. Refresh it before saving changes.')
        update((current) => ({ ...current, error: failure.message }))
        throw failure
      }
      const generation = ++requestGeneration.current
      update((current) => ({ ...current, loading: true, error: null }))
      try {
        const result: PortableConversationTopicIndexResult =
          await writePortableConversationTopicIndex(target, {
            source,
            index,
            expectedRevision: state.index.revision
          })
        if (generation === requestGeneration.current) {
          update(() => ({
            ...result,
            positions: result.positions ?? {},
            loading: false,
            ready: true,
            error: null
          }))
        }
      } catch (failure) {
        if (generation === requestGeneration.current) {
          update((current) => ({ ...current, loading: false, error: failureMessage(failure) }))
        }
        throw failure
      }
    },
    [key, source, state.index.revision, state.loading, state.ready, target, update]
  )
  const refresh = useCallback(() => read('manual'), [read])
  return { ...state, refresh, loadMore: refresh, save }
}
