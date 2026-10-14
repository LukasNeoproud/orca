import { describe, expect, it, vi } from 'vitest'

const { stored } = vi.hoisted(() => ({ stored: new Map<string, string>() }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: string) => void stored.set(key, value)
  }
}))

import { useAzureDevOpsReviewDraftPrompts } from './azure-devops-review-draft-prompts'

describe('useAzureDevOpsReviewDraftPrompts', () => {
  it('keeps prompts typed before the stored ones load, and drops blank ones', async () => {
    stored.set(
      'orca.azureDevOpsReview.draftPrompts',
      JSON.stringify({ old: 'Check nulls', typed: 'stale', junk: 1 })
    )
    const store = useAzureDevOpsReviewDraftPrompts.getState()
    store.setPrompt('typed', 'Shorten it')
    await store.hydrate()
    expect(useAzureDevOpsReviewDraftPrompts.getState().prompts).toEqual({
      old: 'Check nulls',
      typed: 'Shorten it'
    })

    store.setPrompt('old', '  ')
    store.clearPrompts(['typed'])
    expect(useAzureDevOpsReviewDraftPrompts.getState().prompts).toEqual({})
  })
})
