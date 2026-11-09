import { describe, expect, it } from 'vitest'
import { conversationBranchFindings } from './conversation-branch-findings'

describe('conversationBranchFindings', () => {
  it('takes the items of the longest top-level list with their continuation lines', () => {
    const reply = [
      'Summary:',
      '- one small note',
      '',
      'Findings:',
      '',
      '1. **Parser** drops trailing commas.',
      '   See `parse.ts:12`.',
      '2. Cache never expires.',
      '   - nested detail stays with its finding',
      '3. [Docs](http://x) are stale.',
      '',
      'Overall the change looks good.'
    ].join('\n')
    expect(conversationBranchFindings(reply)).toEqual([
      {
        index: 1,
        title: 'Parser drops trailing commas.',
        text: '**Parser** drops trailing commas.\nSee `parse.ts:12`.'
      },
      {
        index: 2,
        title: 'Cache never expires.',
        text: 'Cache never expires.\n- nested detail stays with its finding'
      },
      { index: 3, title: 'Docs are stale.', text: '[Docs](http://x) are stale.' }
    ])
  })

  it('prefers numbered headings, each with the text under it', () => {
    const reply = [
      '## 1. Race in the store',
      'Two writers can interleave.',
      '- a list inside the finding',
      '- another item',
      '## Finding 2: Leaked timer',
      'The interval is never cleared.',
      '## Summary',
      'Fix both.'
    ].join('\n')
    expect(conversationBranchFindings(reply).map((finding) => finding.title)).toEqual([
      'Race in the store',
      'Leaked timer'
    ])
    expect(conversationBranchFindings(reply)[1]?.text).toBe(
      'Leaked timer\nThe interval is never cleared.'
    )
  })

  it('ignores lists inside code and offers nothing for a single item', () => {
    expect(conversationBranchFindings('```\n1. a\n2. b\n```\n- only one')).toEqual([])
    expect(conversationBranchFindings('No list here.')).toEqual([])
  })
})
