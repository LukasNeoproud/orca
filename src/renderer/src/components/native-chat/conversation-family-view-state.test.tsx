// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useConversationFamilyViewState } from './conversation-family-view-state'

afterEach(cleanup)
describe('related conversation view state', () => {
  it('restores the open family and selected detail when returning to a thread', () => {
    const first = renderHook(() => useConversationFamilyViewState('runtime-a/thread-a'))
    act(() => {
      first.result.current.update({ selectedId: 'branch-two' })
      first.result.current.update({ expanded: true })
      first.result.current.setDetailOpen('handoff:branch-two', true)
      first.result.current.setDetailOpen('result:answer', true)
    })
    first.unmount()
    const restored = renderHook(() => useConversationFamilyViewState('runtime-a/thread-a'))
    expect(restored.result.current).toMatchObject({
      selectedId: 'branch-two',
      expanded: true,
      openDetails: ['handoff:branch-two', 'result:answer']
    })
  })
  it('never leaks a selected detail between runtime/session identities on rerender', () => {
    const view = renderHook(({ scope }) => useConversationFamilyViewState(scope), {
      initialProps: { scope: 'host-a/same-session' }
    })
    act(() => view.result.current.update({ selectedId: 'private-branch', expanded: true }))
    view.rerender({ scope: 'host-b/same-session' })
    expect(view.result.current).toMatchObject({ selectedId: null, expanded: false })
    view.rerender({ scope: 'host-a/same-session' })
    expect(view.result.current).toMatchObject({ selectedId: 'private-branch', expanded: true })
  })
})
