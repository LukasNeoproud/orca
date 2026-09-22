// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  familyBranch: vi.fn(),
  external: null as { epoch: string; itemId: string; sequence: number } | null,
  topicRequest: null as { anchor: { epoch: string; itemId: string }; requestId: number } | null
}))

vi.mock('@/lib/conversation-family-navigation', () => ({
  consumeConversationAnchorRequest: mocks.consume,
  useConversationAnchorRequest: () => mocks.external
}))
vi.mock('./use-conversation-family', () => ({
  useConversationFamily: () => ({ branchMessage: mocks.familyBranch })
}))
vi.mock('./use-structured-topic-index-navigation', () => ({
  useStructuredTopicIndexNavigation: () => ({ panel: null, scrollRequest: mocks.topicRequest })
}))
vi.mock('./ConversationFamilyPanel', () => ({ ConversationFamilyPanel: () => null }))

import { useConversationTools } from './use-conversation-tools'

const props = {
  target: { kind: 'local' as const },
  sessionId: 'session',
  isVisible: true
} as never
const controller = {
  epoch: 'epoch',
  items: [],
  loadOlder: vi.fn(),
  messages: [] as NativeChatMessage[]
} as never

describe('useConversationTools', () => {
  beforeEach(() => {
    mocks.consume.mockReset()
    mocks.familyBranch.mockReset()
    mocks.external = null
    mocks.topicRequest = null
  })

  it('consumes each external anchor once and preserves a repeat navigation sequence', async () => {
    const hook = renderHook(() => useConversationTools(props, controller))
    mocks.external = { epoch: 'epoch', itemId: 'source', sequence: 1 }
    hook.rerender()
    await waitFor(() => expect(hook.result.current.scrollRequest?.requestId).toBe(-1))
    expect(mocks.consume).toHaveBeenCalledOnce()

    act(() => {
      mocks.external = null
      hook.rerender()
    })
    act(() => {
      mocks.external = { epoch: 'epoch', itemId: 'source', sequence: 2 }
      hook.rerender()
    })
    await waitFor(() => expect(hook.result.current.scrollRequest?.requestId).toBe(-2))
    expect(mocks.consume).toHaveBeenCalledTimes(2)
  })

  it('keeps the family branch callback available to the message list owner', () => {
    const hook = renderHook(() => useConversationTools(props, controller))
    expect(hook.result.current.branchMessage).toBe(mocks.familyBranch)
  })
})
