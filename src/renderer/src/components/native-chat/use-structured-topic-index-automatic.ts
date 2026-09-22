import { useEffect, useMemo, useRef } from 'react'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredTopicIndex } from '../../../../shared/structured-topic-index'

export function useStructuredTopicIndexAutomatic(args: {
  index: StructuredTopicIndex
  items: readonly AgentJournalRenderItem[] | undefined
  epoch: string | null | undefined
  ready: boolean
  visible: boolean
  refresh: () => Promise<unknown>
}): void {
  const { epoch, index, items, ready, refresh, visible } = args
  const completedSequence = useMemo(() => latestCompletedAssistantSequence(items ?? []), [items])
  const completionSignal = useMemo(() => {
    const item = items?.findLast(
      (entry) => entry.body.kind === 'status' && entry.body.turnLifecycle
    )
    return item?.body.kind === 'status'
      ? JSON.stringify([item.itemId, item.revision, item.body.turnLifecycle])
      : ''
  }, [items])
  const attempted = useRef<{ key: string; refresh: typeof refresh } | null>(null)
  useEffect(() => {
    if (!visible || !ready || !index.automatic || !epoch) {
      return
    }
    const durableEnd =
      index.chapters.at(-1)?.end.epoch === epoch ? (index.chapters.at(-1)?.end.sequence ?? 0) : 0
    if (completedSequence <= durableEnd) {
      return
    }
    const key = `${index.sessionId}:${epoch}:${durableEnd}:${completedSequence}:${completionSignal}`
    if (attempted.current?.key === key && attempted.current.refresh === refresh) {
      return
    }
    attempted.current = { key, refresh }
    void refresh().catch(() => {})
  }, [completedSequence, completionSignal, epoch, index, ready, refresh, visible])
}

export function latestCompletedAssistantSequence(items: readonly AgentJournalRenderItem[]): number {
  let pending: { assistant: number | null; running: boolean; sawLifecycle: boolean } | null = null
  let completed = 0
  for (const item of items) {
    if (item.body.kind === 'message' && item.body.role === 'user') {
      if (pending?.assistant) {
        completed = Math.max(completed, pending.assistant)
      }
      pending = { assistant: null, running: false, sawLifecycle: false }
      continue
    }
    if (item.body.kind === 'message' && item.body.role === 'assistant') {
      pending ??= { assistant: null, running: false, sawLifecycle: false }
      pending.assistant = item.sequence
      continue
    }
    if (!pending) {
      continue
    }
    if (item.body.kind === 'status' && item.body.turnLifecycle) {
      pending.sawLifecycle = true
      pending.running = item.body.turnLifecycle.state === 'running'
      if (!pending.running && pending.assistant) {
        completed = Math.max(completed, pending.assistant)
      }
    }
  }
  if (pending?.assistant && (!pending.sawLifecycle || !pending.running)) {
    completed = Math.max(completed, pending.assistant)
  }
  return completed
}
