import { describe, expect, it } from 'vitest'
import { appendAiResponseComments, formatAiResponseComments } from './ai-response-comments'

describe('response comment prompt formatting', () => {
  const comments = [
    { id: 'a', quote: 'first line\r\n  indented code', comment: 'Keep the cache.' },
    { id: 'b', quote: 'Another answer', comment: 'Change this.\nKeep that.' }
  ]

  it('pairs every captured citation with its comment, preserving inner whitespace', () => {
    expect(formatAiResponseComments(comments)).toBe(
      '> first line\n>   indented code\n\nComment: Keep the cache.\n\n> Another answer\n\nComment: Change this.\nKeep that.'
    )
  })

  it('supports comment-only sends and keeps an existing prompt intact', () => {
    expect(appendAiResponseComments('', comments)).toBe(formatAiResponseComments(comments))
    expect(appendAiResponseComments('My prompt  ', comments)).toBe(
      `My prompt  \n\n${formatAiResponseComments(comments)}`
    )
    expect(appendAiResponseComments('My prompt  ', [])).toBe('My prompt  ')
  })

  it('does not turn incomplete comments into sendable messages', () => {
    expect(
      formatAiResponseComments([
        { id: 'a', quote: '  ', comment: 'comment' },
        { id: 'b', quote: 'quote', comment: '\n' }
      ])
    ).toBe('')
  })
})
