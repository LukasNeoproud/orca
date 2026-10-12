import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileNativeChatMessageActionsSheet } from './MobileNativeChatMessageActionsSheet'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))
vi.mock('lucide-react-native', () => ({
  Copy: 'Copy',
  MessageSquareQuote: 'MessageSquareQuote',
  TextSelect: 'TextSelect',
  X: 'X'
}))
vi.mock('../platform/clipboard', () => ({ useClipboardWriter: () => ({ writeText: vi.fn() }) }))
vi.mock('../components/mounted-bottom-drawer', () => ({ MountedBottomDrawer: 'MountedDrawer' }))

const quote = 'Before\n  const answer = 42\nAfter'
const reply: NativeChatMessage = {
  id: 'reply',
  source: 'transcript',
  role: 'assistant',
  timestamp: null,
  blocks: [{ type: 'text', text: quote }]
}

describe('commenting on a response from its actions sheet', () => {
  let renderer: ReactTestRenderer | null = null
  const onClose = vi.fn()
  const onCommentQuote = vi.fn()
  const nodes = (type: string) => renderer!.root.findAll((node) => String(node.type) === type)
  const byLabel = (label: string) =>
    renderer!.root.find((node) => node.props.accessibilityLabel === label)

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => act(() => renderer?.unmount()))

  function openCommentScreen(): void {
    act(() => {
      renderer = create(
        createElement(MobileNativeChatMessageActionsSheet, {
          message: reply,
          onClose,
          onCommentQuote
        })
      )
    })
    act(() => nodes('Pressable')[2]!.props.onPress())
    act(() => nodes('MountedDrawer')[0]!.props.onHidden())
  }

  it('quotes the selected range verbatim and closes the sheet', () => {
    openCommentScreen()
    const input = byLabel('Selected response quote')
    expect(input.props.value).toBe(quote)
    act(() => input.props.onSelectionChange({ nativeEvent: { selection: { start: 7, end: 26 } } }))
    act(() => byLabel('Comment on selected text').props.onPress())

    expect(onCommentQuote).toHaveBeenCalledWith(quote.slice(7, 26))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cancels without staging a comment', () => {
    openCommentScreen()
    act(() => byLabel('Cancel comment selection').props.onPress())

    expect(onCommentQuote).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
