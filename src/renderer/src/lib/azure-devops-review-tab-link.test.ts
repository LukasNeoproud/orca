import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  let state = { tabsByWorktree: {}, unifiedTabsByWorktree: {}, setTabCustomTitle: vi.fn() }
  const listeners = new Set<(next: typeof state) => void>()
  return {
    getState: () => state,
    setState: (patch: Partial<typeof state>) => {
      state = { ...state, ...patch }
      listeners.forEach((listener) => listener(state))
    },
    subscribe: (listener: (next: typeof state) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listenerCount: () => listeners.size
  }
})
const linkTab = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({ useAppStore: store }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store/azure-devops-review-chat-links', () => ({
  useAzureDevOpsReviewChatLinks: { getState: () => ({ linkTab }) }
}))

import { linkNextReviewTab, reviewTabIds } from './azure-devops-review-tab-link'

afterEach(() => {
  vi.useRealTimers()
  linkTab.mockReset()
})

describe('linkNextReviewTab', () => {
  it('links the structured chat the host opens after the launch returns', () => {
    store.setState({
      tabsByWorktree: { wt: [{ id: 'old-terminal' }] },
      unifiedTabsByWorktree: { wt: [] }
    } as never)
    const before = reviewTabIds(store.getState() as never, 'wt')
    linkNextReviewTab('wt', before, 'pr-7')
    expect(linkTab).not.toHaveBeenCalled()

    store.setState({
      unifiedTabsByWorktree: { wt: [{ id: 'chat-1', contentType: 'agent-session' }] }
    } as never)
    expect(linkTab).toHaveBeenCalledWith('chat-1', 'pr-7')
    expect(store.getState().setTabCustomTitle).not.toHaveBeenCalled()
    expect(store.listenerCount()).toBe(0)
  })

  it('stops waiting when no tab appears', () => {
    vi.useFakeTimers()
    store.setState({ tabsByWorktree: { wt: [] }, unifiedTabsByWorktree: { wt: [] } } as never)
    linkNextReviewTab('wt', new Set(), 'pr-7')
    vi.advanceTimersByTime(60_000)
    expect(store.listenerCount()).toBe(0)
    expect(linkTab).not.toHaveBeenCalled()
  })
})
