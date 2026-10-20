import { beforeEach, describe, expect, it } from 'vitest'
import { useAzureDevOpsReviewDraftPrompts } from './azure-devops-review-draft-prompts'

describe('useAzureDevOpsReviewDraftPrompts', () => {
  beforeEach(() => {
    useAzureDevOpsReviewDraftPrompts.setState({
      prompts: {},
      generalPrompts: {}
    })
  })

  it('drops a prompt set to blank text', () => {
    const store = useAzureDevOpsReviewDraftPrompts.getState()
    store.setPrompt('d1', { pullRequestKey: 'pr', text: 'Verify' })
    expect(useAzureDevOpsReviewDraftPrompts.getState().prompts.d1?.text).toBe('Verify')
    store.setPrompt('d1', { pullRequestKey: 'pr', text: '  ' })
    expect(useAzureDevOpsReviewDraftPrompts.getState().prompts.d1).toBeUndefined()
  })

  it("prunes only the pull request's prompts whose drafts are gone", () => {
    const store = useAzureDevOpsReviewDraftPrompts.getState()
    store.setPrompt('live', { pullRequestKey: 'pr', text: 'a' })
    store.setPrompt('gone', { pullRequestKey: 'pr', text: 'b' })
    store.setPrompt('other', { pullRequestKey: 'pr2', text: 'c' })
    store.prunePrompts('pr', new Set(['live']))
    expect(Object.keys(useAzureDevOpsReviewDraftPrompts.getState().prompts).sort()).toEqual([
      'live',
      'other'
    ])
  })

  it('keeps the general prompt per pull request and drops it when blank', () => {
    const store = useAzureDevOpsReviewDraftPrompts.getState()
    store.setGeneralPrompt('pr', 'Check thread safety ')
    store.setGeneralPrompt('pr2', 'Other')
    expect(useAzureDevOpsReviewDraftPrompts.getState().generalPrompts).toEqual({
      pr: 'Check thread safety ',
      pr2: 'Other'
    })
    store.setGeneralPrompt('pr', ' ')
    expect(useAzureDevOpsReviewDraftPrompts.getState().generalPrompts).toEqual({
      pr2: 'Other'
    })
  })
})
