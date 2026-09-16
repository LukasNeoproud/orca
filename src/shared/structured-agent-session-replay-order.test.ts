import { describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from './agent-session-journal-types'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  reduceStructuredAgentSession
} from './structured-agent-session-reducer'

function item(itemId: string, sequence: number, revision = 1): AgentJournalRenderItem {
  return {
    itemId,
    sequence,
    revision,
    observedAt: sequence,
    body: { kind: 'status', text: itemId }
  }
}

describe('conversation order after provider replay', () => {
  it.each([
    [3, 2],
    [0, 2],
    [3, 1]
  ])('keeps creation order for replay sequence %s revision %s', (sequence, revision) => {
    const original = item('startup-error', 1)
    const updated = reduceStructuredAgentSession(
      {
        ...EMPTY_STRUCTURED_AGENT_SESSION,
        epoch: 'epoch',
        fence: 1,
        cursor: { epoch: 'epoch', sequence: 2 },
        items: [original, item('assistant', 2)]
      },
      {
        type: 'event',
        event: {
          type: 'batch',
          sessionId: 'session',
          batch: {
            cursor: { epoch: 'epoch', sequence: 3 },
            items: [
              {
                ...item('startup-error', sequence, revision),
                body: { kind: 'status', text: 'Still unavailable' }
              }
            ],
            removedItemIds: [],
            submissions: []
          }
        }
      }
    )
    expect(updated.items.map((value) => value.itemId)).toEqual(['startup-error', 'assistant'])
    expect(updated.items[0]).toMatchObject({
      revision,
      sequence: original.sequence,
      observedAt: original.observedAt,
      body: { text: revision > 1 ? 'Still unavailable' : 'startup-error' }
    })
    expect(updated.cursor?.sequence).toBe(3)
  })
})
