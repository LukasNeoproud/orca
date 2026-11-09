import { describe, expect, it } from 'vitest'
import { conversationBranchTerminalArgs } from './conversation-branch-terminal-launch'

describe('conversationBranchTerminalArgs', () => {
  it('resumes a fork after the person’s own arguments', () => {
    expect(conversationBranchTerminalArgs(' --model opus ', 'fork-1', false)).toBe(
      '--model opus --resume fork-1'
    )
  })

  it('starts a clean branch under the id the host recorded', () => {
    expect(conversationBranchTerminalArgs('', 'fresh-1', true)).toBe('--session-id fresh-1')
  })
})
