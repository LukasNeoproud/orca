// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { NativeChatRailItem } from './native-chat-message-rail-items'
import {
  requestNativeChatRailJump,
  useNativeChatRequestedRailJump
} from './native-chat-requested-rail-jump'

afterEach(cleanup)

function railItem(id: string): NativeChatRailItem {
  return { id, slotIndex: null, text: id, hasImages: false }
}

it('waits for the requested message to reach a rail, then jumps once', () => {
  const select = vi.fn()
  const { rerender } = renderHook(({ items }) => useNativeChatRequestedRailJump(items, select), {
    initialProps: { items: [railItem('a')] }
  })
  act(() => requestNativeChatRailJump('b'))
  expect(select).not.toHaveBeenCalled()

  rerender({ items: [railItem('a'), railItem('b')] })
  expect(select).toHaveBeenCalledTimes(1)
  expect(select.mock.calls[0]?.[0]).toMatchObject({ id: 'b' })

  rerender({ items: [railItem('a'), railItem('b'), railItem('c')] })
  expect(select).toHaveBeenCalledTimes(1)
})

it('leaves the request to the chat that lists the message', () => {
  const other = vi.fn()
  const owner = vi.fn()
  renderHook(() => useNativeChatRequestedRailJump([railItem('x')], other))
  act(() => requestNativeChatRailJump('y'))
  renderHook(() => useNativeChatRequestedRailJump([railItem('y')], owner))
  expect(other).not.toHaveBeenCalled()
  expect(owner).toHaveBeenCalledTimes(1)
})
