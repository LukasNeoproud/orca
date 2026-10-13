import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { activateWorkspaceTabPaletteResult } from '@/lib/workspace-tab-palette-activation'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { Tab } from '../../../shared/tab-types'

type ChatTabState = Pick<AppState, 'tabsByWorktree' | 'unifiedTabsByWorktree'>

// Why cached: store selectors call the lookup, and a fresh object per call re-renders forever.
const chatTabViews = new WeakMap<Tab, TerminalTab>()

function chatTabAsTerminalTab(tab: Tab): TerminalTab {
  let view = chatTabViews.get(tab)
  if (!view) {
    view = {
      id: tab.id,
      ptyId: null,
      worktreeId: tab.worktreeId,
      title: tab.label,
      customTitle: tab.customLabel,
      color: tab.color,
      sortOrder: tab.sortOrder,
      createdAt: tab.createdAt
    }
    chatTabViews.set(tab, view)
  }
  return view
}

/** The newest live agent tab started for this pull request, if any. */
export function findAzureDevOpsReviewChatTab(
  state: ChatTabState,
  tabLinks: ReturnType<typeof useAzureDevOpsReviewChatLinks.getState>['tabs'],
  pullRequestKey: string
): TerminalTab | null {
  const newest: { best: { tab: TerminalTab; linkedAt: number } | null } = { best: null }
  const consider = (tab: TerminalTab): void => {
    const link = tabLinks[tab.id]
    if (
      link?.pullRequestKey === pullRequestKey &&
      (!newest.best || link.linkedAt > newest.best.linkedAt)
    ) {
      newest.best = { tab, linkedAt: link.linkedAt }
    }
  }
  for (const tabs of Object.values(state.tabsByWorktree)) {
    tabs.forEach(consider)
  }
  // Why: a structured chat has no terminal tab; the tab bar shows it as one keyed by its unified id.
  for (const tabs of Object.values(state.unifiedTabsByWorktree)) {
    for (const tab of tabs) {
      if (tab.contentType === 'agent-session') {
        consider(chatTabAsTerminalTab(tab))
      }
    }
  }
  return newest.best?.tab ?? null
}

/** Shows the agent tab for a pull request in its review workspace. */
export function openAzureDevOpsReviewChat(tab: TerminalTab): boolean {
  const unifiedTabs = useAppStore.getState().unifiedTabsByWorktree[tab.worktreeId] ?? []
  const chat = unifiedTabs.find(
    (candidate) => candidate.contentType === 'agent-session' && candidate.id === tab.id
  )
  if (chat) {
    if (!activateStructuredAgentSessionTab({ worktreeId: tab.worktreeId, tabId: chat.id })) {
      return false
    }
    closeAzureDevOpsPullRequestPage()
    return true
  }
  const unified = unifiedTabs.find(
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
  const state = useAppStore.getState()
  const live = new Set([
    ...Object.values(state.tabsByWorktree).flatMap((tabs) => tabs.map((t) => t.id)),
    ...Object.values(state.unifiedTabsByWorktree).flatMap((tabs) =>
      tabs.filter((t) => t.contentType === 'agent-session').map((t) => t.id)
    )
  ])
  const dead = Object.keys(links.tabs).filter((tabId) => !live.has(tabId))
  if (dead.length > 0) {
    links.forgetTabs(dead)
  }
}
