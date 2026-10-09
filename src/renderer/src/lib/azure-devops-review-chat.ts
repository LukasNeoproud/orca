import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { activateWorkspaceTabPaletteResult } from '@/lib/workspace-tab-palette-activation'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import type { TerminalTab } from '../../../shared/terminal-tab-types'

type ChatTabState = Pick<AppState, 'tabsByWorktree'>

/** The newest live agent tab started for this pull request, if any. */
export function findAzureDevOpsReviewChatTab(
  state: ChatTabState,
  tabLinks: ReturnType<typeof useAzureDevOpsReviewChatLinks.getState>['tabs'],
  pullRequestKey: string
): TerminalTab | null {
  let best: { tab: TerminalTab; linkedAt: number } | null = null
  for (const tabs of Object.values(state.tabsByWorktree)) {
    for (const tab of tabs) {
      const link = tabLinks[tab.id]
      if (link?.pullRequestKey === pullRequestKey && (!best || link.linkedAt > best.linkedAt)) {
        best = { tab, linkedAt: link.linkedAt }
      }
    }
  }
  return best?.tab ?? null
}

/** Shows the agent tab for a pull request in its review workspace. */
export function openAzureDevOpsReviewChat(tab: TerminalTab): boolean {
  const unified = (useAppStore.getState().unifiedTabsByWorktree[tab.worktreeId] ?? []).find(
    (candidate) => candidate.contentType === 'terminal' && candidate.entityId === tab.id
  )
  if (!unified) {
    return false
  }
  const result = activateWorkspaceTabPaletteResult({
    contentType: 'terminal',
    entityId: tab.id,
    groupId: unified.groupId,
    tabId: unified.id,
    worktreeId: tab.worktreeId
  })
  if (result.status !== 'activated') {
    return false
  }
  // Why: the page overlays the workbench; staying in the same workspace would leave it covering the chat.
  closeAzureDevOpsPullRequestPage()
  return true
}

/** Drops links to tabs that no longer exist so the store does not grow forever. */
export function pruneAzureDevOpsReviewChatLinks(): void {
  const links = useAzureDevOpsReviewChatLinks.getState()
  const live = new Set(
    Object.values(useAppStore.getState().tabsByWorktree).flatMap((tabs) => tabs.map((t) => t.id))
  )
  const dead = Object.keys(links.tabs).filter((tabId) => !live.has(tabId))
  if (dead.length > 0) {
    links.forgetTabs(dead)
  }
}
