import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AiVaultSessionOpenedTarget } from '@/lib/ai-vault-session-open'
import {
  classifyRememberedAiVaultTerminalOwner,
  findQueuedAiVaultSessionTerminal
} from '@/lib/ai-vault-session-terminal-owner'
import { classifyRememberedAiVaultStructuredOwner } from '@/lib/ai-vault-session-structured-owner'

export function activateAiVaultResumeWorkspace(workspaceId: string): void {
  const workspaceScope = parseWorkspaceKey(workspaceId)
  if (workspaceScope?.type === 'folder') {
    activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(workspaceId)
}

export async function activateRememberedAiVaultSession(
  target: AiVaultSessionOpenedTarget
): Promise<boolean> {
  const state = useAppStore.getState()
  if (target.kind === 'terminal') {
    const exists = (state.tabsByWorktree[target.workspaceId] ?? []).some(
      (tab) => tab.id === target.tabId
    )
    if (!exists) {
      return false
    }
    activateAiVaultResumeWorkspace(target.workspaceId)
    const fresh = useAppStore.getState()
    fresh.setActiveTabType('terminal', target.workspaceId)
    fresh.setActiveTab(target.tabId)
    return true
  }
  return activateAiVaultStructuredSession({
    structuredSession: {
      workspaceId: target.workspaceId,
      sessionId: target.sessionId
    }
  })
}

export async function classifyRememberedAiVaultSession(
  session: AiVaultSession,
  target: AiVaultSessionOpenedTarget
): Promise<'live' | 'unverifiable' | 'exited'> {
  if (target.kind === 'structured') {
    return classifyRememberedAiVaultStructuredOwner(session)
  }
  return classifyRememberedAiVaultTerminalOwner(
    useAppStore.getState(),
    session.executionHostId,
    target
  )
}

export function activateQueuedAiVaultTerminalSession(session: AiVaultSession): boolean {
  const state = useAppStore.getState()
  const target = findQueuedAiVaultSessionTerminal(state, session)
  if (!target) {
    return false
  }
  activateAiVaultResumeWorkspace(target.workspaceId)
  const fresh = useAppStore.getState()
  fresh.setActiveTabType('terminal', target.workspaceId)
  fresh.setActiveTab(target.tabId)
  return true
}
