import { describe, expect, it } from 'vitest'
import { branchRecord } from '../../../shared/conversation-branch.test-fixture'
import { conversationBranchMemberSurface } from './conversation-branch-members'

describe('conversationBranchMemberSurface', () => {
  const terminalBranch = branchRecord({
    branchId: 'b-terminal',
    child: { providerSessionId: 'term-child', surface: 'terminal' }
  })
  const chatSourced = branchRecord({
    branchId: 'b-chat',
    parent: { ...branchRecord().parent, providerSessionId: 'chat-root', structuredSessionId: 's1' },
    child: { providerSessionId: 'chat-child', surface: 'chat' }
  })
  const branches = [terminalBranch, chatSourced]

  it('opens a branch on the surface it was made for', () => {
    expect(conversationBranchMemberSurface(branches, 'term-child')).toBe('terminal')
    expect(conversationBranchMemberSurface(branches, 'chat-child')).toBe('chat')
  })

  it('opens an original where it was branched from', () => {
    expect(conversationBranchMemberSurface(branches, 'parent')).toBe('terminal')
    expect(conversationBranchMemberSurface(branches, 'chat-root')).toBe('chat')
  })
})
