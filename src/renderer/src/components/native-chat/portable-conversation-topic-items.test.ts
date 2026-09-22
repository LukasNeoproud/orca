import { describe, expect, it } from 'vitest'
import { portableConversationTopicItems } from './portable-conversation-topic-items'

const cursor = { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint' }
const identity = { fingerprint: 'fingerprint', size: 10, mtimeMs: 1 }

function message(id: string, role: 'user' | 'assistant') {
  return {
    id,
    role,
    blocks: [{ type: 'text' as const, text: id }],
    timestamp: null,
    source: 'transcript' as const
  }
}

describe('portableConversationTopicItems', () => {
  it('uses a same-page structured anchor to retain exact intermediate user sequences for splitting', () => {
    const items = portableConversationTopicItems({
      index: {
        sessionId: 'portable',
        revision: 1,
        automatic: true,
        chapters: [
          {
            id: 'topic',
            title: 'Auth',
            titleSource: 'automatic',
            boundaryAfterManual: false,
            start: { epoch: 'fingerprint', itemId: 'user-1', sequence: 0 },
            end: { epoch: 'fingerprint', itemId: 'assistant-2', sequence: 3 }
          }
        ]
      },
      anchors: {
        'user-1': { messageId: 'user-1', cursor, identity },
        'user-2': { messageId: 'user-2', cursor, identity }
      },
      messages: [
        message('user-1', 'user'),
        message('assistant-1', 'assistant'),
        message('user-2', 'user'),
        message('assistant-2', 'assistant')
      ]
    })
    expect(items).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'user-2', sequence: 2 })])
    )
  })

  it('uses server positions for a split prompt on a later transcript page', () => {
    const laterCursor = {
      offset: 50,
      boundaryCheckpoint: 'checkpoint-50',
      fileFingerprint: 'fingerprint'
    }
    const items = portableConversationTopicItems({
      index: {
        sessionId: 'portable',
        revision: 1,
        automatic: true,
        chapters: [
          {
            id: 'topic',
            title: 'Auth',
            titleSource: 'automatic',
            boundaryAfterManual: false,
            start: { epoch: 'fingerprint', itemId: 'user-1', sequence: 0 },
            end: { epoch: 'fingerprint', itemId: 'assistant-2', sequence: 53 }
          }
        ]
      },
      anchors: {
        'user-2': { messageId: 'user-2', cursor: laterCursor, identity }
      },
      positions: {
        'user-2': { epoch: 'fingerprint', itemId: 'user-2', sequence: 52 }
      },
      messages: [message('user-2', 'user'), message('assistant-2', 'assistant')]
    })
    expect(items).toEqual([expect.objectContaining({ itemId: 'user-2', sequence: 52 })])
  })
})
