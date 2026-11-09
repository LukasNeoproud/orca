import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileNativeChatMessageActionsSheet } from './MobileNativeChatMessageActionsSheet'
import {
  MobileConversationBranchContext,
  type MobileConversationBranching
} from './mobile-conversation-branch-context'

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
  GitBranch: 'GitBranch',
  ListTree: 'ListTree',
  MessageSquareQuote: 'MessageSquareQuote',
  Reply: 'Reply',
  TextSelect: 'TextSelect',
  X: 'X'
}))
vi.mock('../platform/clipboard', () => ({ useClipboardWriter: () => ({ writeText: vi.fn() }) }))
vi.mock('../components/mounted-bottom-drawer', () => ({ MountedBottomDrawer: 'MountedDrawer' }))

const reply: NativeChatMessage = {
  id: 'reply-1',
  source: 'transcript',
  role: 'assistant',
  timestamp: null,
  blocks: [{ type: 'text', text: 'Two findings.' }]
}

describe('branching from a reply’s actions sheet', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => act(() => renderer?.unmount()))

  function open(branching: MobileConversationBranching | null, branchable: boolean) {
    const onClose = vi.fn()
    act(() => {
      renderer = create(
        createElement(
          MobileConversationBranchContext.Provider,
          { value: branching },
          createElement(MobileNativeChatMessageActionsSheet, {
            message: reply,
            onClose,
            branchable
          })
        )
      )
    })
    const labels = renderer!.root
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => node.props.children)
    const press = (label: string) => {
      const row = renderer!.root
        .findAll((node) => String(node.type) === 'Pressable')
        .find((node) => node.findAll((child) => child.props.children === label).length > 0)
      act(() => row!.props.onPress())
      act(() =>
        renderer!.root.findAll((node) => String(node.type) === 'MountedDrawer')[0]!.props.onHidden()
      )
    }
    return { labels, press, onClose }
  }

  it('offers the branch actions the chat has and runs them once the sheet is gone', () => {
    const branching = { branchFrom: vi.fn(), returnFrom: vi.fn(), openFamily: vi.fn() }
    const sheet = open(branching, true)
    expect(sheet.labels).toEqual(
      expect.arrayContaining([
        'Branch from here',
        'Return result to the branch point',
        'Conversation family'
      ])
    )
    sheet.press('Branch from here')
    expect(sheet.onClose).toHaveBeenCalledOnce()
    expect(branching.branchFrom).toHaveBeenCalledWith(reply)
    expect(branching.returnFrom).not.toHaveBeenCalled()
  })

  it('keeps an unfinished reply and a chat without branching to the plain actions', () => {
    const unfinished = open({ branchFrom: vi.fn(), openFamily: vi.fn() }, false)
    expect(unfinished.labels).not.toContain('Branch from here')
    expect(unfinished.labels).toContain('Conversation family')
    act(() => renderer?.unmount())
    expect(open(null, true).labels).not.toContain('Branch from here')
  })
})
