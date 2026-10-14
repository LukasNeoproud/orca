import { create } from 'zustand'

const STORAGE_KEY = 'orca.azureDevOpsReview.draftPrompts'

export type AzureDevOpsDraftPrompt = { pullRequestKey: string; text: string }

type DraftPromptsState = {
  /** The user's AI instruction per draft id, waiting to be sent. */
  prompts: Record<string, AzureDevOpsDraftPrompt>
  setPrompt: (draftId: string, prompt: AzureDevOpsDraftPrompt) => void
  clearPrompts: (draftIds: readonly string[]) => void
  /** Drops prompts of a pull request's drafts that were deleted or published. */
  prunePrompts: (pullRequestKey: string, liveDraftIds: ReadonlySet<string>) => void
}

function isPrompt(value: unknown): value is AzureDevOpsDraftPrompt {
  return (
    !!value &&
    typeof value === 'object' &&
    'pullRequestKey' in value &&
    typeof value.pullRequestKey === 'string' &&
    'text' in value &&
    typeof value.text === 'string'
  )
}

function readStoredPrompts(): Record<string, AzureDevOpsDraftPrompt> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, AzureDevOpsDraftPrompt] =>
        isPrompt(entry[1])
      )
    )
  } catch {
    return {}
  }
}

function storePrompts(prompts: Record<string, AzureDevOpsDraftPrompt>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
  } catch {
    // Unsent prompts only survive a reload as a convenience.
  }
}

// Why renderer-local: a prompt is an unsent request from this desktop, not part of the draft.
export const useAzureDevOpsReviewDraftPrompts = create<DraftPromptsState>((set, get) => {
  const replace = (prompts: Record<string, AzureDevOpsDraftPrompt>): void => {
    set({ prompts })
    storePrompts(prompts)
  }
  return {
    prompts: readStoredPrompts(),
    setPrompt: (draftId, prompt) => {
      const prompts = { ...get().prompts }
      if (prompt.text.trim()) {
        prompts[draftId] = prompt
      } else {
        delete prompts[draftId]
      }
      replace(prompts)
    },
    clearPrompts: (draftIds) => {
      const prompts = { ...get().prompts }
      for (const draftId of draftIds) {
        delete prompts[draftId]
      }
      replace(prompts)
    },
    prunePrompts: (pullRequestKey, liveDraftIds) => {
      const current = get().prompts
      const stale = Object.keys(current).filter(
        (draftId) =>
          current[draftId].pullRequestKey === pullRequestKey && !liveDraftIds.has(draftId)
      )
      if (stale.length > 0) {
        get().clearPrompts(stale)
      }
    }
  }
})
