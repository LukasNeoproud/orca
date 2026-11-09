// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { branchRecord } from '../../../../shared/conversation-branch.test-fixture'
import type { AgentSessionStatusSummary } from '../../../../shared/agent-session-wire'

const feed = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  let snapshot = new Map<string, AgentSessionStatusSummary>()
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    publish: (next: Map<string, AgentSessionStatusSummary>) => {
      snapshot = next
      listeners.forEach((listener) => listener())
    }
  }
})
const drafts = vi.hoisted(() => new Map<string, string>())

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }))
vi.mock('@/runtime/structured-agent-session-status-feed', () => ({
  getStructuredAgentSessionStatusFeed: () => feed
}))
vi.mock('../native-chat/native-chat-draft-cache', () => ({
  readNativeChatDraftCache: (key: string) => drafts.get(key) ?? '',
  writeNativeChatDraftCache: (key: string, text: string) => drafts.set(key, text)
}))

import { useConversationBranchSendGuard } from './conversation-branch-send-guard'

function chat(sessionId: string, providerSessionId: string, status: 'working' | 'idle') {
  const summary: AgentSessionStatusSummary = {
    sessionId,
    workspaceId: 'wt-1',
    agent: 'claude',
    status,
    latestPrompt: '',
    updatedAt: 1,
    providerSession: { key: 'session_id', id: providerSessionId }
  }
  return [sessionId, summary] as const
}

const branches = [
  branchRecord({
    branchId: 'a',
    label: 'Fix parser',
    child: { providerSessionId: 'c1', surface: 'chat' }
  }),
  branchRecord({
    branchId: 'b',
    label: 'Fix cache',
    child: { providerSessionId: 'c2', surface: 'chat' }
  })
]

function render() {
  return renderHook(() =>
    useConversationBranchSendGuard({
      target: { kind: 'local' },
      sessionId: 's-2',
      worktreeId: 'wt-1',
      providerSessionId: 'c2',
      branches
    })
  )
}

beforeEach(() => {
  drafts.clear()
  drafts.set('agent-session:s-2', 'Fix the cache')
  feed.publish(new Map([chat('s-1', 'c1', 'working'), chat('s-2', 'c2', 'idle')]))
})
afterEach(cleanup)

it('sends at once while no relative works', () => {
  feed.publish(new Map([chat('s-1', 'c1', 'idle')]))
  const send = vi.fn(() => true)
  const { result } = render()
  expect(result.current.guardSend('Fix the cache', send)).toBe(true)
  expect(send).toHaveBeenCalledOnce()
})

it('holds a send while a relative works and sends it anyway on request', () => {
  const send = vi.fn(() => true)
  const { result } = render()
  act(() => {
    expect(result.current.guardSend('Fix the cache', send)).toBe(false)
  })
  expect(result.current.asking?.relatives).toEqual(['Fix parser'])
  expect(send).not.toHaveBeenCalled()
  act(() => result.current.sendNow())
  expect(send).toHaveBeenCalledOnce()
  expect(drafts.get('agent-session:s-2')).toBe('')
})

it('sends a held message when the relative finishes, unless the draft changed', () => {
  const send = vi.fn(() => true)
  const { result } = render()
  act(() => {
    result.current.guardSend('Fix the cache', send)
  })
  act(() => result.current.sendWhenDone())
  expect(send).not.toHaveBeenCalled()
  act(() => feed.publish(new Map([chat('s-1', 'c1', 'idle')])))
  expect(send).toHaveBeenCalledOnce()

  feed.publish(new Map([chat('s-1', 'c1', 'working')]))
  drafts.set('agent-session:s-2', 'Fix the cache')
  act(() => {
    result.current.guardSend('Fix the cache', send)
  })
  act(() => result.current.sendWhenDone())
  drafts.set('agent-session:s-2', 'Something else')
  act(() => feed.publish(new Map([chat('s-1', 'c1', 'idle')])))
  expect(send).toHaveBeenCalledOnce()
})
