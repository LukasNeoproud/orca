import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { translate } from '@/i18n/i18n'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'

const LINK_WAIT_MS = 60_000

type ReviewTabState = Pick<AppState, 'tabsByWorktree' | 'unifiedTabsByWorktree'>

/** Terminal tab ids and chat (agent-session) tab ids that can carry a review link. */
export function reviewTabIds(state: ReviewTabState, worktreeId: string): Set<string> {
  return new Set([
    ...(state.tabsByWorktree[worktreeId] ?? []).map((tab) => tab.id),
    ...(state.unifiedTabsByWorktree[worktreeId] ?? [])
      .filter((tab) => tab.contentType === 'agent-session')
      .map((tab) => tab.id)
  ])
}

/** Links a review tab to its pull request: the chip, the page's chat button and the tab title. */
export function linkReviewTab(tabId: string, pullRequestKey: string, isTerminal: boolean): void {
  useAzureDevOpsReviewChatLinks.getState().linkTab(tabId, pullRequestKey)
  if (isTerminal) {
    // Why: the tab's PR chip carries the number; the agent's own OSC titles would hide which tab reviews.
    useAppStore
      .getState()
      .setTabCustomTitle(tabId, translate('azureDevOpsReview.agentTabTitle', 'Review'))
  }
}

/**
 * Links the first tab that appears in the review workspace after a launch the host opens itself
 * (a structured chat, or a terminal once the host answered): such launches return no tab id.
 */
export function linkNextReviewTab(
  worktreeId: string,
  before: ReadonlySet<string>,
  pullRequestKey: string
): void {
  const find = (state: ReviewTabState): { id: string; isTerminal: boolean } | null => {
    const terminal = (state.tabsByWorktree[worktreeId] ?? []).find((tab) => !before.has(tab.id))
    if (terminal) {
      return { id: terminal.id, isTerminal: true }
    }
    const chat = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
      (tab) => tab.contentType === 'agent-session' && !before.has(tab.id)
    )
    return chat ? { id: chat.id, isTerminal: false } : null
  }
  let unsubscribe: (() => void) | null = null
  const settle = (state: ReviewTabState): boolean => {
    const found = find(state)
    if (!found) {
      return false
    }
    unsubscribe?.()
    clearTimeout(timeout)
    linkReviewTab(found.id, pullRequestKey, found.isTerminal)
    return true
  }
  const timeout = setTimeout(() => unsubscribe?.(), LINK_WAIT_MS)
  if (!settle(useAppStore.getState())) {
    unsubscribe = useAppStore.subscribe((state) => {
      settle(state)
    })
  }
}
