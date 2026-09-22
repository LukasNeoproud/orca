import { useState } from 'react'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredTopicAnchor } from '../../../../shared/structured-topic-index'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { StructuredTopicIndexPanel } from './StructuredTopicIndexPanel'
import { useStructuredTopicIndex } from './use-structured-topic-index'
import { useStructuredTopicIndexAutomatic } from './use-structured-topic-index-automatic'

type TopicScrollRequest = { anchor: StructuredTopicAnchor; requestId: number } | null

export function useStructuredTopicIndexNavigation(input: {
  sessionId: string
  target: RuntimeClientTarget
  visible: boolean
  items: readonly AgentJournalRenderItem[] | undefined
  epoch: string | null | undefined
  loadOlder: () => Promise<unknown>
}): { panel: React.JSX.Element; scrollRequest: TopicScrollRequest } {
  const topicIndex = useStructuredTopicIndex(
    input.sessionId,
    input.target,
    input.visible && input.items !== undefined
  )
  const [scrollRequest, setScrollRequest] = useState<TopicScrollRequest>(null)
  useStructuredTopicIndexAutomatic({
    index: topicIndex.index,
    ready: topicIndex.ready,
    items: input.items,
    epoch: input.epoch,
    visible: input.visible,
    refresh: topicIndex.refresh
  })
  return {
    panel: (
      <StructuredTopicIndexPanel
        index={topicIndex.index}
        items={input.items ?? []}
        epoch={input.epoch}
        error={topicIndex.error}
        onNavigate={(anchor) =>
          setScrollRequest((current) => ({ anchor, requestId: (current?.requestId ?? 0) + 1 }))
        }
        onSave={(index) => {
          void topicIndex.save(index).catch(() => {})
        }}
        onLoadOlder={() => {
          void input.loadOlder()
        }}
      />
    ),
    scrollRequest
  }
}
