// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredTopicIndex } from '../../../../shared/structured-topic-index'
import {
  latestCompletedAssistantSequence,
  useStructuredTopicIndexAutomatic
} from './use-structured-topic-index-automatic'

function message(sequence: number, role: 'user' | 'assistant'): AgentJournalRenderItem {
  return {
    itemId: `${role}-${sequence}`,
    sequence,
    revision: 1,
    observedAt: sequence,
    body: { kind: 'message', role, blocks: [{ type: 'text', text: role }] }
  }
}

function lifecycle(sequence: number, state: 'running' | 'completed'): AgentJournalRenderItem {
  return {
    itemId: `status-${sequence}`,
    sequence,
    revision: 1,
    observedAt: sequence,
    body: { kind: 'status', text: state, turnLifecycle: { turnId: 'turn', state } }
  }
}

function index(endSequence = 0, automatic = true): StructuredTopicIndex {
  return {
    sessionId: 'session',
    revision: endSequence > 0 ? 1 : 0,
    automatic,
    chapters:
      endSequence > 0
        ? [
            {
              id: 'chapter',
              title: 'Topic',
              start: { epoch: 'epoch', itemId: 'user-1', sequence: 1 },
              end: { epoch: 'epoch', itemId: `assistant-${endSequence}`, sequence: endSequence },
              titleSource: 'automatic',
              boundaryAfterManual: false
            }
          ]
        : []
  }
}

describe('structured topic automatic refresh', () => {
  it('recognizes only completed assistant boundaries in a single pass', () => {
    expect(
      latestCompletedAssistantSequence([
        message(1, 'user'),
        message(2, 'assistant'),
        lifecycle(3, 'running')
      ])
    ).toBe(0)
    expect(
      latestCompletedAssistantSequence([
        message(1, 'user'),
        message(2, 'assistant'),
        lifecycle(3, 'running'),
        lifecycle(4, 'completed')
      ])
    ).toBe(2)
    expect(latestCompletedAssistantSequence([message(8, 'assistant')])).toBe(8)
    expect(
      latestCompletedAssistantSequence([
        message(1, 'user'),
        message(2, 'assistant'),
        message(3, 'user')
      ])
    ).toBe(2)
  })

  it('refreshes the host until its durable end reaches the observed completion', async () => {
    const refresh = vi.fn(async () => undefined)
    const items = [message(129, 'user'), message(130, 'assistant')]
    const { rerender } = renderHook(
      ({ durableEnd }) =>
        useStructuredTopicIndexAutomatic({
          index: index(durableEnd),
          items,
          epoch: 'epoch',
          ready: true,
          visible: true,
          refresh
        }),
      { initialProps: { durableEnd: 0 } }
    )
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    rerender({ durableEnd: 128 })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    rerender({ durableEnd: 130 })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('rechecks a previously inconclusive boundary when its completion event arrives', async () => {
    const refresh = vi.fn(async () => undefined)
    const hook = renderHook(
      ({ items }) =>
        useStructuredTopicIndexAutomatic({
          index: index(),
          items,
          epoch: 'epoch',
          ready: true,
          visible: true,
          refresh
        }),
      { initialProps: { items: [message(2, 'assistant')] } }
    )
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    hook.rerender({ items: [message(2, 'assistant'), lifecycle(3, 'completed')] })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    hook.rerender({ items: [message(2, 'assistant'), lifecycle(3, 'completed')] })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does not refresh while hidden, unreadable, manual, or unfinished', () => {
    const refresh = vi.fn(async () => undefined)
    const unfinished = [message(1, 'user'), message(2, 'assistant'), lifecycle(3, 'running')]
    const { rerender } = renderHook(
      (props) => useStructuredTopicIndexAutomatic({ ...props, refresh }),
      {
        initialProps: {
          index: index(),
          items: unfinished,
          epoch: 'epoch' as string | null,
          ready: true,
          visible: true
        }
      }
    )
    rerender({
      index: index(0, false),
      items: [message(2, 'assistant')],
      epoch: 'epoch',
      ready: true,
      visible: true
    })
    rerender({
      index: index(),
      items: [message(2, 'assistant')],
      epoch: 'epoch',
      ready: false,
      visible: true
    })
    rerender({
      index: index(),
      items: [message(2, 'assistant')],
      epoch: 'epoch',
      ready: true,
      visible: false
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
