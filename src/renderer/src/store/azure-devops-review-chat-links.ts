import { create } from 'zustand'

const STORAGE_KEY = 'orca.azureDevOpsReview.chatLinks'

type ChatLink = { pullRequestKey: string; linkedAt: number }

type AzureDevOpsReviewChatLinksState = {
  /** Agent tabs started by "Review with AI", keyed by terminal tab id. */
  tabs: Record<string, ChatLink>
  /** Pull request each shared review worktree currently has checked out. */
  worktrees: Record<string, string | null>
  linkTab: (tabId: string, pullRequestKey: string) => void
  forgetTabs: (tabIds: readonly string[]) => void
  setWorktreePullRequest: (worktreeId: string, pullRequestKey: string | null) => void
}

type StoredLinks = Pick<AzureDevOpsReviewChatLinksState, 'tabs' | 'worktrees'>

function readStoredLinks(): StoredLinks {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredLinks | null
    return {
      tabs: parsed?.tabs && typeof parsed.tabs === 'object' ? parsed.tabs : {},
      worktrees: parsed?.worktrees && typeof parsed.worktrees === 'object' ? parsed.worktrees : {}
    }
  } catch {
    return { tabs: {}, worktrees: {} }
  }
}

function storeLinks(links: StoredLinks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
  } catch {
    // Links are a navigation convenience; losing them only hides the shortcut.
  }
}

// Why renderer-local: tab ids are this desktop's, and the host registry already owns the checkout.
export const useAzureDevOpsReviewChatLinks = create<AzureDevOpsReviewChatLinksState>(
  (set, get) => ({
    ...readStoredLinks(),
    linkTab: (tabId, pullRequestKey) => {
      set({ tabs: { ...get().tabs, [tabId]: { pullRequestKey, linkedAt: Date.now() } } })
      storeLinks(get())
    },
    forgetTabs: (tabIds) => {
      const tabs = { ...get().tabs }
      for (const tabId of tabIds) {
        delete tabs[tabId]
      }
      set({ tabs })
      storeLinks(get())
    },
    setWorktreePullRequest: (worktreeId, pullRequestKey) => {
      if (get().worktrees[worktreeId] === pullRequestKey) {
        return
      }
      set({ worktrees: { ...get().worktrees, [worktreeId]: pullRequestKey } })
      storeLinks(get())
    }
  })
)
