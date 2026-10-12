import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useMobileNativeChatResponseComments,
  type MobileNativeChatResponseComments
} from './mobile-native-chat-response-comments-context'
import { MobileNativeChatResponseCommentsProvider } from './MobileNativeChatResponseCommentsProvider'

vi.mock('./MobileAiResponseCommentSheets', () => ({
  MobileAiResponseCommentsSheet: (props: { visible: boolean }) =>
    props.visible ? createElement('CommentsSheet') : null,
  MobileAiResponseCommentEditor: (props: { draft: unknown }) =>
    props.draft ? createElement('CommentEditor') : null
}))

const comments = {
  comments: [{ id: 'c1', quote: 'reply', comment: 'note' }],
  commentsRef: { current: [] },
  addComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  clearComments: vi.fn()
}

describe('MobileNativeChatResponseCommentsProvider', () => {
  let renderer: ReactTestRenderer | null = null
  let current: MobileNativeChatResponseComments | null = null

  function Consumer(): null {
    current = useMobileNativeChatResponseComments()
    return null
  }

  function element(sendSurfaceId: string) {
    return createElement(
      MobileNativeChatResponseCommentsProvider,
      { comments, sendSurfaceId },
      createElement(Consumer)
    )
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    current = null
  })

  it('counts pending comments and closes the editor when the chat surface changes', () => {
    act(() => {
      renderer = create(element('tab-a'))
    })
    expect(current?.count).toBe(1)

    act(() => current!.onCommentQuote('reply'))
    expect(renderer!.root.findAllByType('CommentEditor' as never)).toHaveLength(1)

    act(() => renderer!.update(element('tab-b')))
    expect(renderer!.root.findAllByType('CommentEditor' as never)).toHaveLength(0)

    act(() => current!.openComments())
    expect(renderer!.root.findAllByType('CommentsSheet' as never)).toHaveLength(1)
  })
})
