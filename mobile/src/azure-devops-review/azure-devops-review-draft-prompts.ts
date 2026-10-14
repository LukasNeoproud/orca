import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'orca.azureDevOpsReview.draftPrompts'

type DraftPromptsState = {
  /** The user's AI instruction per draft id, waiting to be sent. */
  prompts: Record<string, string>
  hydrated: boolean
  hydrate: () => Promise<void>
  setPrompt: (draftId: string, text: string) => void
  clearPrompts: (draftIds: readonly string[]) => void
}

function readPrompts(raw: string | null): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null')
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

// Why phone-local: a prompt is an unsent request from this device, not part of the draft.
export const useAzureDevOpsReviewDraftPrompts = create<DraftPromptsState>((set, get) => {
  const persist = (prompts: Record<string, string>): void => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prompts)).catch(() => undefined)
  }
  const replace = (prompts: Record<string, string>): void => {
    set({ prompts })
    // Why: a write before the read would replace every stored prompt with this one.
    if (get().hydrated) {
      persist(prompts)
    }
  }
  return {
    prompts: {},
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated) {
        return
      }
      const stored = readPrompts(await AsyncStorage.getItem(STORAGE_KEY).catch(() => null))
      // A prompt typed before the read finished wins over the stored one.
      const prompts = { ...stored, ...get().prompts }
      set({ prompts, hydrated: true })
      persist(prompts)
    },
    setPrompt: (draftId, text) => {
      const prompts = { ...get().prompts }
      if (text.trim()) {
        prompts[draftId] = text
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
    }
  }
})
