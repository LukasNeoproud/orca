import { describe, expect, it } from 'vitest'
import {
  defaultCleanBranchPrompt,
  defaultConversationBranchLabel
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
