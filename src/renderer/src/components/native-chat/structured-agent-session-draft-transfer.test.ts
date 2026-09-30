import { afterEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatAttachmentCacheForTests,
  readNativeChatAttachmentCache,
  writeNativeChatAttachmentCache
} from './use-native-chat-composer-attachments'
import {
  clearNativeChatDraftCacheForTests,
  readNativeChatDraftCache,
  readNativeChatResponseComments,
  writeNativeChatResponseComments,
  writeNativeChatDraftCache
} from './native-chat-draft-cache'
import {
  adoptStructuredSessionComposerDraft,
  clearStructuredSessionComposerDraftTransfersForTests,
  stageStructuredSessionComposerDraft
} from './structured-agent-session-draft-transfer'

afterEach(() => {
  clearNativeChatDraftCacheForTests()
  clearNativeChatAttachmentCacheForTests()
  clearStructuredSessionComposerDraftTransfersForTests()
})

describe('structured session composer draft transfer', () => {
  it('moves the unsent text and settled image attachments to the selected session', () => {
    writeNativeChatDraftCache('source-pane', 'Review the open change')
    writeNativeChatAttachmentCache('source-pane', [{ id: 'image-1', path: '/tmp/screenshot.png' }])

    stageStructuredSessionComposerDraft({
      sourcePaneKey: 'source-pane',
      targetSessionId: 'codex_next'
    })
    adoptStructuredSessionComposerDraft({
      targetPaneKey: 'destination-pane',
      sessionId: 'codex_next'
    })

    expect(readNativeChatDraftCache('destination-pane')).toBe('Review the open change')
    expect(readNativeChatAttachmentCache('destination-pane')).toEqual([
      { id: 'image-1', path: '/tmp/screenshot.png' }
    ])
    expect(readNativeChatDraftCache('source-pane')).toBe('Review the open change')
  })

  it('stages a reference ahead of the unsent message without dispatching either', () => {
    writeNativeChatDraftCache('source-pane', 'Continue from the failing test.')

    stageStructuredSessionComposerDraft({
      sourcePaneKey: 'source-pane',
      targetSessionId: 'codex_reference',
      prefix: 'Read the scoped history reference at /tmp/history.md before replying.'
    })
    adoptStructuredSessionComposerDraft({
      targetPaneKey: 'destination-pane',
      sessionId: 'codex_reference'
    })

    expect(readNativeChatDraftCache('destination-pane')).toBe(
      'Read the scoped history reference at /tmp/history.md before replying.\n\nContinue from the failing test.'
    )
  })

  it('moves a comment-only draft to the selected session', () => {
    const responseComments = [
      { id: 'comment-1', quote: 'const value = 1', comment: 'Rename this.' }
    ]
    writeNativeChatResponseComments('source-pane', responseComments)

    stageStructuredSessionComposerDraft({
      sourcePaneKey: 'source-pane',
      targetSessionId: 'codex_comments'
    })
    adoptStructuredSessionComposerDraft({
      targetPaneKey: 'destination-pane',
      sessionId: 'codex_comments'
    })

    expect(readNativeChatDraftCache('destination-pane')).toBe('')
    expect(readNativeChatResponseComments('destination-pane')).toEqual(responseComments)
  })
})
