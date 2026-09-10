import { describe, expect, it } from 'vitest'
import { getLinkedWorkItemBranchSuggestion } from './linked-work-item-branch-suggestion'
import { getLinkedWorkItemWorkspaceName } from '../../../shared/workspace-name'
import type { LinkedWorkItemSummary } from './new-workspace'

describe('linked work item branch suggestions', () => {
  it.each(['github', 'gitlab', 'jira'] as const)(
    'derives %s suggestions from the linked item',
    (provider) => {
      const item: LinkedWorkItemSummary = {
        provider,
        type: 'issue',
        number: 123,
        title: 'Fix the bug',
        url: 'https://example.com/issue/123',
        ...(provider === 'jira' ? { jiraIdentifier: 'ENG-123' } : {})
      }
      expect(getLinkedWorkItemBranchSuggestion(item)).toBe(
        getLinkedWorkItemWorkspaceName(item)?.seedName
      )
    }
  )
  it('uses the exact Linear provider branch rather than its generated title', () => {
    expect(
      getLinkedWorkItemBranchSuggestion({
        provider: 'linear',
        type: 'issue',
        number: 0,
        title: 'Fix the bug',
        url: 'https://linear.app/team/issue/ENG-123',
        linearIdentifier: 'ENG-123',
        linearBranchName: 'user/eng-123-fix'
      })
    ).toBe('user/eng-123-fix')
  })
  it('uses a resolved review branch override', () => {
    expect(
      getLinkedWorkItemBranchSuggestion(
        {
          provider: 'gitlab',
          type: 'mr',
          number: 123,
          title: 'Review',
          url: 'https://gitlab.com/group/repo/-/merge_requests/123'
        },
        'contributor/review'
      )
    ).toBe('contributor/review')
  })
  it('does not offer stale overrides after unlinking', () => {
    expect(getLinkedWorkItemBranchSuggestion(null, 'old')).toBeUndefined()
  })
})
