import { describe, expect, it } from 'vitest'
import { targetedConversationHandoff, conversationResultDraft } from './conversation-branch-draft'

describe('reviewable conversation handoffs', () => {
  it('includes only the chosen passage and separates proposals from accepted decisions', () => {
    const selectedText = 'Possible cause: **cache invalidation**.\n```ts\nclearCache()\n```'
    const text = `${selectedText}\n\nUnrelated billing migration.`
    const result = targetedConversationHandoff({ text, selectedText })
    expect(result).toContain(selectedText)
    expect(result).not.toContain('billing')
    expect(result).toContain('not independently verified')
    expect(result).toContain('No additional accepted decisions')
    expect(result).toContain('existing project instructions and permissions')
    expect(result).toContain('Expected verification')
  })
  it('never equates a reported result with code integration', () => {
    expect(conversationResultDraft('The parser handles empty input.')).toContain(
      'No code has been merged'
    )
    expect(conversationResultDraft('The parser handles empty input.')).toContain(
      'checks ran and their actual results'
    )
  })
})
