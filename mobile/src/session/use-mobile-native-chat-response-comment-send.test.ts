import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiResponseComment } from '../../../src/shared/ai-response-comments'
import { useMobileNativeChatResponseCommentSend } from './use-mobile-native-chat-response-comment-send'

type CommentSend = ReturnType<typeof useMobileNativeChatResponseCommentSend>

describe('useMobileNativeChatResponseCommentSend', () => {
  let renderer: ReactTestRenderer | null = null
  let api: CommentSend | null = null
  const legacySend = vi.fn()
  const structuredSend = vi.fn()

  function Probe(): null {
    api = useMobileNativeChatResponseCommentSend('host\0worktree\0tab', false, {
      legacy: legacySend,
      structured: structuredSend
    })
    return null
  }

  beforeEach(() => {
    legacySend.mockReset()
    structuredSend.mockReset()
    act(() => {
      renderer = create(createElement(Probe))
    })
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    api = null
  })

  it('sends comments without prompt text and retains them after rejection', async () => {
    legacySend.mockResolvedValue('rejected')
    act(() => {
      api!.responseComments.addComment('selected output', 'Fix this')
    })

    await act(async () => {
      expect(await api!.send('')).toBe(false)
    })

    expect(legacySend).toHaveBeenCalledWith(
      '> selected output\n\nComment: Fix this',
      undefined,
      undefined,
      ''
    )
    expect(api!.responseComments.comments).toHaveLength(1)
  })

  it('preserves a comment edited while its prior snapshot is accepted', async () => {
    let resolveSend!: (outcome: 'accepted') => void
    legacySend.mockReturnValue(new Promise<'accepted'>((resolve) => (resolveSend = resolve)))
    let submitted: AiResponseComment | null = null
    act(() => {
      submitted = api!.responseComments.addComment('selected output', 'Old note')
    })
    let sending!: Promise<boolean>
    await act(async () => {
      sending = api!.send('Prompt')
      await Promise.resolve()
    })
    act(() => {
      api!.responseComments.updateComment({ ...submitted!, comment: 'New note' })
    })
    await act(async () => {
      resolveSend('accepted')
      await sending
    })

    expect(api!.responseComments.comments).toEqual([
      expect.objectContaining({ comment: 'New note' })
    ])
  })
})
