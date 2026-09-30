import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { useMobileAiResponseComments } from './use-mobile-ai-response-comments'

type Comments = ReturnType<typeof useMobileAiResponseComments>

describe('useMobileAiResponseComments', () => {
  let renderer: ReactTestRenderer | null = null
  let comments: Comments | null = null

  function Probe({ scopeKey }: { scopeKey: string }): null {
    comments = useMobileAiResponseComments(scopeKey)
    return null
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    comments = null
  })

  it('isolates comments by chat scope and preserves the quote bytes', () => {
    act(() => {
      renderer = create(createElement(Probe, { scopeKey: 'chat-a' }))
    })
    act(() => {
      comments!.addComment('  selected line  ', 'review this')
    })
    expect(comments!.comments).toMatchObject([
      { quote: '  selected line  ', comment: 'review this' }
    ])

    act(() => renderer!.update(createElement(Probe, { scopeKey: 'chat-b' })))
    expect(comments!.comments).toEqual([])
    act(() => renderer!.update(createElement(Probe, { scopeKey: 'chat-a' })))
    expect(comments!.comments).toHaveLength(1)
  })

  it('does not clear a comment edited while its prior snapshot sends', () => {
    act(() => {
      renderer = create(createElement(Probe, { scopeKey: 'chat-a' }))
    })
    let sentSnapshot!: NonNullable<ReturnType<Comments['addComment']>>
    act(() => {
      sentSnapshot = comments!.addComment('quote', 'old comment')!
    })
    act(() => {
      comments!.updateComment({ ...sentSnapshot, comment: 'new comment' })
      comments!.clearComments([sentSnapshot])
    })

    expect(comments!.comments).toEqual([{ ...sentSnapshot, comment: 'new comment' }])
  })
})
