import { describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from './agent-session-journal-types'
import { latestStructuredTaskProposalSource } from './structured-task-proposal-source'

const message = (
  itemId: string,
  sequence: number,
  role: 'user' | 'assistant',
  text: string
): AgentJournalRenderItem => ({
  itemId,
  sequence,
  revision: 1,
  observedAt: sequence,
  body: { kind: 'message', role, blocks: [{ type: 'text', text }] }
})

describe('structured task proposal source', () => {
  it('uses the completed user prompt for an ordinary decomposition', () => {
    const source = latestStructuredTaskProposalSource({
      sessionId: 'session',
      workspaceId: 'workspace',
      epoch: 'epoch',
      items: [
        message('user', 1, 'user', 'Add export and fix login.'),
        message('assistant', 2, 'assistant', 'Done.')
      ]
    })
    expect(source).toMatchObject({ kind: 'prompt', anchor: { itemId: 'user' } })
    expect(source?.passages).toEqual([{ itemId: 'user', text: 'Add export and fix login.' }])
  })

  it('analyzes completed review findings and keeps their source prompt', () => {
    const source = latestStructuredTaskProposalSource({
      sessionId: 'session',
      workspaceId: 'workspace',
      epoch: 'epoch',
      items: [
        message('user', 1, 'user', '/review the current changes'),
        message('assistant', 2, 'assistant', '- Finding A\n- Finding B')
      ]
    })
    expect(source).toMatchObject({ kind: 'review', anchor: { itemId: 'assistant' } })
    expect(source?.passages.map((passage) => passage.itemId)).toEqual(['user', 'assistant'])
  })

  it('offers an ordinary prompt immediately without waiting for the assistant', () => {
    const source = latestStructuredTaskProposalSource({
      sessionId: 'session',
      workspaceId: 'workspace',
      epoch: 'epoch',
      items: [
        message('old-user', 1, 'user', 'Completed request.'),
        message('old-reply', 2, 'assistant', 'Done.'),
        message('new-user', 3, 'user', 'Still running')
      ]
    })
    expect(source?.anchor.itemId).toBe('new-user')
  })

  it('waits for completed findings before offering review decomposition', () => {
    const source = latestStructuredTaskProposalSource({
      sessionId: 'session',
      workspaceId: 'workspace',
      epoch: 'epoch',
      items: [message('review-user', 1, 'user', '/review the changes')]
    })
    expect(source).toBeNull()
  })
})
