import { afterEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatDraftCacheForTests,
  appendNativeChatResponseComment,
  readNativeChatDraftCache,
  readNativeChatResponseComments,
  writeNativeChatDraftCache,
  writeNativeChatDraftDocument
} from './native-chat-draft-cache'
import { NATIVE_CHAT_COMPOSER_SCOPE_CACHE_MAX } from './native-chat-composer-scope-cache'

afterEach(() => {
  clearNativeChatDraftCacheForTests()
})

describe('native-chat draft cache', () => {
  it('returns an empty string for an unknown scope', () => {
    expect(readNativeChatDraftCache('pty-1')).toBe('')
  })

  it('round-trips a draft per scope key', () => {
    writeNativeChatDraftCache('pty-1', 'hello')
    writeNativeChatDraftCache('pty-2', 'world')
    expect(readNativeChatDraftCache('pty-1')).toBe('hello')
    expect(readNativeChatDraftCache('pty-2')).toBe('world')
  })

  it('drops the entry when the draft is cleared so stale text never resurfaces', () => {
    writeNativeChatDraftCache('pty-1', 'hello')
    writeNativeChatDraftCache('pty-1', '')
    expect(readNativeChatDraftCache('pty-1')).toBe('')
  })

  it('keeps response comments beside an empty draft until they are sent', () => {
    appendNativeChatResponseComment('pty-1', '  selected code\n', 'Explain this')
    writeNativeChatDraftCache('pty-1', 'temporary prompt')
    writeNativeChatDraftCache('pty-1', '')

    expect(readNativeChatDraftCache('pty-1')).toBe('')
    expect(readNativeChatResponseComments('pty-1')).toMatchObject([
      { quote: '  selected code\n', comment: 'Explain this' }
    ])
  })

  it('keeps comment-only state when the rich editor writes an empty document', () => {
    appendNativeChatResponseComment('pty-1', 'answer', 'Reconsider this')
    writeNativeChatDraftDocument('pty-1', '', { type: 'doc' })

    expect(readNativeChatResponseComments('pty-1')).toHaveLength(1)
  })

  it('bounds the cache so unsent drafts for removed panes cannot accumulate', () => {
    writeNativeChatDraftCache('keep', 'hot')

    const total = NATIVE_CHAT_COMPOSER_SCOPE_CACHE_MAX + 40
    for (let i = 0; i < total; i += 1) {
      writeNativeChatDraftCache(`scope-${i}`, `draft-${i}`)
      if (i % 20 === 0) {
        writeNativeChatDraftCache('keep', 'hot')
      }
    }

    // Oldest untouched draft evicted; the actively-edited and most-recent survive.
    expect(readNativeChatDraftCache('scope-0')).toBe('')
    expect(readNativeChatDraftCache('keep')).toBe('hot')
    expect(readNativeChatDraftCache(`scope-${total - 1}`)).toBe(`draft-${total - 1}`)
  })
})
