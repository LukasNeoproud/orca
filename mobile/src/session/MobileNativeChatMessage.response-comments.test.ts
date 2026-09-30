import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'

vi.mock('react-native', () => ({
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  Image: 'Image',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('lucide-react-native', () => ({
  ArrowUp: 'ArrowUp',
  Copy: 'Copy',
  GitBranch: 'GitBranch',
  MessageSquareQuote: 'MessageSquareQuote',
  X: 'X'
}))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('./MobileNativeChatToolRun', () => ({ ToolRun: 'ToolRun' }))
vi.mock('./MobileNativeChatGenerationStats', () => ({ MobileNativeChatGenerationStats: 'Stats' }))
vi.mock('./MobileNativeChatTurnStatus', () => ({ MobileNativeChatTurnStatus: 'TurnStatus' }))

import { MobileNativeChatMessage } from './MobileNativeChatMessage'

describe('mobile response quote selection', () => {
  let renderer: ReactTestRenderer
  const quote = 'Before\n  const answer = 42\nAfter'
  const onCommentQuote = vi.fn()
  const touch = (x = 20, y = 30) => ({ nativeEvent: { pageX: x, pageY: y } })

  beforeEach(() => {
    vi.useFakeTimers()
    onCommentQuote.mockReset()
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    vi.useRealTimers()
  })

  function render(role: NativeChatMessage['role'] = 'assistant'): void {
    act(() => {
      renderer = create(
        createElement(MobileNativeChatMessage, {
          message: {
            id: 'response',
            role,
            blocks: [{ type: 'text', text: quote }],
            timestamp: null,
            source: 'transcript'
          },
          onCommentQuote
        }),
        { createNodeMock: () => ({ focus: vi.fn() }) }
      )
    })
  }
  const content = () =>
    renderer.root.findAllByType('View' as never).find((node) => node.props.onTouchStart)!
  const selection = () =>
    renderer.root.findAllByProps({ accessibilityLabel: 'Selected response quote' })
  function longPress(): void {
    act(() => content().props.onTouchStart(touch()))
    act(() => vi.advanceTimersByTime(451))
  }

  it('captures the narrowed range verbatim and returns to the rendered response', () => {
    render()
    longPress()
    const input = selection()[0]
    expect(input.props.value).toBe(quote)
    expect(input.props.selection).toEqual({ start: 0, end: quote.length })
    expect(input.props.showSoftInputOnFocus).toBe(false)
    act(() => input.props.onSelectionChange({ nativeEvent: { selection: { start: 7, end: 26 } } }))
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Comment on selected text' }).props.onPress()
    )
    expect(onCommentQuote).toHaveBeenCalledWith(quote.slice(7, 26))
    expect(onCommentQuote.mock.calls[0][0]).toMatch(/^  const/)
    expect(selection()).toHaveLength(0)
  })

  it('cancels selection without staging a comment', () => {
    render()
    longPress()
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Cancel comment selection' }).props.onPress()
    )
    expect(selection()).toHaveLength(0)
    expect(onCommentQuote).not.toHaveBeenCalled()
  })

  it('does not enter selection during a tap or scrolling gesture', () => {
    render()
    act(() => {
      content().props.onTouchStart(touch())
      content().props.onTouchEnd()
    })
    act(() => vi.advanceTimersByTime(500))
    expect(selection()).toHaveLength(0)
    act(() => {
      content().props.onTouchStart(touch())
      content().props.onTouchMove(touch(20, 60))
    })
    act(() => vi.advanceTimersByTime(500))
    expect(selection()).toHaveLength(0)
  })

  it('allows small finger motion but excludes user messages', () => {
    render()
    act(() => {
      content().props.onTouchStart(touch())
      content().props.onTouchMove(touch(22, 31))
    })
    act(() => vi.advanceTimersByTime(500))
    expect(selection()).toHaveLength(1)
    act(() => renderer.unmount())
    render('user')
    longPress()
    expect(selection()).toHaveLength(0)
  })
})
