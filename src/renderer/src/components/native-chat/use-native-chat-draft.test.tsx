// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatDraftCacheForTests,
  readNativeChatDraftCache,
  readNativeChatResponseComments
} from './native-chat-draft-cache'
import { useNativeChatDraft } from './use-native-chat-draft'

afterEach(() => clearNativeChatDraftCacheForTests())

describe('useNativeChatDraft scope fencing', () => {
  it('applies stale async clears to the original scope without clearing the active draft', () => {
    const view = renderHook(({ scopeKey }) => useNativeChatDraft(scopeKey), {
      initialProps: { scopeKey: 'session-a' }
    })
    act(() => {
      view.result.current.setDraft('first prompt')
      view.result.current.responseCommentDraft.add('first quote', 'first comment')
    })
    const staleSetDraft = view.result.current.setDraft
    const staleClearComments = view.result.current.responseCommentDraft.clear

    view.rerender({ scopeKey: 'session-b' })
    act(() => {
      view.result.current.setDraft('second prompt')
      view.result.current.responseCommentDraft.add('second quote', 'second comment')
      staleSetDraft('')
      staleClearComments()
    })

    expect(view.result.current.draft).toBe('second prompt')
    expect(view.result.current.responseCommentDraft.comments).toMatchObject([
      { quote: 'second quote', comment: 'second comment' }
    ])
    expect(readNativeChatDraftCache('session-a')).toBe('')
    expect(readNativeChatResponseComments('session-a')).toEqual([])
  })

  it('restores a canceled send to its original scope without overwriting newer content', () => {
    const view = renderHook(({ scopeKey }) => useNativeChatDraft(scopeKey), {
      initialProps: { scopeKey: 'session-a' }
    })
    act(() => {
      view.result.current.setDraft('first prompt')
      view.result.current.responseCommentDraft.add('first quote', 'first comment')
    })
    const submittedComments = view.result.current.responseCommentDraft.comments
    const restoreCanceledSend = view.result.current.responseCommentDraft.restoreCanceledSend
    act(() => {
      view.result.current.setDraft('')
      view.result.current.responseCommentDraft.clear()
    })

    view.rerender({ scopeKey: 'session-b' })
    act(() => {
      view.result.current.setDraft('new prompt')
      restoreCanceledSend('first prompt', submittedComments)
    })

    expect(readNativeChatDraftCache('session-a')).toBe('first prompt')
    expect(readNativeChatResponseComments('session-a')).toEqual(submittedComments)
    expect(view.result.current.draft).toBe('new prompt')
    expect(view.result.current.responseCommentDraft.comments).toEqual([])
  })
})
