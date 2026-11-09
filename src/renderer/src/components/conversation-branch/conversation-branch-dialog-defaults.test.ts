import { describe, expect, it } from 'vitest'
import {
  defaultCleanBranchPrompt,
  defaultConversationBranchLabel,
  defaultFindingBranchFocus,
  defaultFindingBranchLabel,
  defaultFindingBranchPrompt
} from './conversation-branch-dialog-defaults'

describe('defaultConversationBranchLabel', () => {
  it('takes the first prose line without markdown markers', () => {
    expect(defaultConversationBranchLabel('\n## **Findings**\n1. Race in `store`')).toBe('Findings')
    expect(defaultConversationBranchLabel('---\n- `null` deref in parser')).toBe(
      'null deref in parser'
    )
  })

  it('shortens a long line and gives nothing for an empty reply', () => {
    const label = defaultConversationBranchLabel('x'.repeat(300))
    expect(label).toHaveLength(80)
    expect(label.endsWith('…')).toBe(true)
    expect(defaultConversationBranchLabel('```\n```')).toBe('')
  })
})

describe('defaultCleanBranchPrompt', () => {
  it('quotes the reply and leaves the task to write', () => {
    expect(defaultCleanBranchPrompt('One\nTwo\n')).toBe(
      'Context from the conversation this one branched from:\n\n> One\n> Two\n\nTask: '
    )
  })

  it('cuts a long reply', () => {
    const prompt = defaultCleanBranchPrompt('y'.repeat(5000))
    expect(prompt).toContain(`> ${'y'.repeat(4000)}…`)
  })
})

describe('finding branch defaults', () => {
  const finding = { index: 2, title: 'Cache never expires.', text: 'Cache never expires.\nSee x.' }

  it('names the branch by number and asks for that finding only', () => {
    expect(defaultFindingBranchLabel(finding)).toBe('2. Cache never expires.')
    expect(defaultFindingBranchPrompt(finding, 'full')).toBe('Fix finding 2: Cache never expires.')
    expect(defaultFindingBranchFocus(finding)).toBe('Finding 2: Cache never expires.\nSee x.')
  })

  it('quotes the finding in a clean branch, which has no history', () => {
    expect(defaultFindingBranchPrompt(finding, 'clean')).toContain(
      '> See x.\n\nTask: Fix this finding.'
    )
  })
})
