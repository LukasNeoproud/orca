import { describe, expect, it } from 'vitest'
import { findAzureDevOpsReviewChatTab } from './azure-devops-review-chat'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { Tab } from '../../../shared/tab-types'

function tab(id: string, worktreeId = 'wt-review'): TerminalTab {
  return { id, worktreeId } as TerminalTab
}

describe('findAzureDevOpsReviewChatTab', () => {
  const chat = {
    id: 'chat-1',
    worktreeId: 'wt-review',
    contentType: 'agent-session',
    label: 'Chat'
  }
  const state = {
    tabsByWorktree: { 'wt-review': [tab('a'), tab('b')], 'wt-main': [tab('c')] },
    unifiedTabsByWorktree: { 'wt-review': [chat as Tab] }
  }

  it('returns the most recently linked live tab for the pull request', () => {
    const links = {
      a: { pullRequestKey: 'pr-1', linkedAt: 1 },
      b: { pullRequestKey: 'pr-1', linkedAt: 2 },
      c: { pullRequestKey: 'pr-2', linkedAt: 3 }
    }
    expect(findAzureDevOpsReviewChatTab(state, links, 'pr-1')?.id).toBe('b')
    expect(findAzureDevOpsReviewChatTab(state, links, 'pr-2')?.id).toBe('c')
  })

  it('finds a structured chat tab by its unified tab id', () => {
    const links = {
      a: { pullRequestKey: 'pr-1', linkedAt: 1 },
      'chat-1': { pullRequestKey: 'pr-1', linkedAt: 4 }
    }
    expect(findAzureDevOpsReviewChatTab(state, links, 'pr-1')).toMatchObject({
      id: 'chat-1',
      worktreeId: 'wt-review',
      ptyId: null
    })
  })

  it('returns the same chat tab object for unchanged state, as store selectors require', () => {
    const links = { 'chat-1': { pullRequestKey: 'pr-1', linkedAt: 4 } }
    expect(findAzureDevOpsReviewChatTab(state, links, 'pr-1')).toBe(
      findAzureDevOpsReviewChatTab(state, links, 'pr-1')
    )
  })

  it('ignores links to closed tabs', () => {
    const links = { gone: { pullRequestKey: 'pr-1', linkedAt: 5 } }
    expect(findAzureDevOpsReviewChatTab(state, links, 'pr-1')).toBeNull()
  })
})
