import { folderWorkspaceToWorktree } from '../../../shared/folder-workspace-worktree'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { AiVaultAgent } from '../../../shared/ai-vault-types'
import type { BacklogTaskAssociationTerminal } from '../../../shared/backlog-task-association'
import type { Worktree } from '../../../shared/worktree/types'
import { getProjectIdentityKey } from '../../../shared/project-host-setup-projection'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../shared/execution-host'
import { getAiVaultAgentProviderSession } from '@/lib/ai-vault-resume-command'
import { useAppStore } from '@/store'
import {
  findOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from '@/components/right-sidebar/ai-vault-original-pane-index'
import { getAiVaultSessionWorktreeMap } from '@/components/right-sidebar/ai-vault-session-worktree'
import type { BacklogRoute } from './backlog-rpc'

export type BacklogTaskConversationOption = {
  id: string
  title: string
  updatedAt: string | null
  surface: 'structured' | 'terminal'
  agent: AiVaultAgent
  providerSession?: AgentProviderSessionMetadata
  structuredSessionId?: string
  history?: { filePath: string; codexHome?: string; cwd?: string }
  terminal?: BacklogTaskAssociationTerminal
}

function projectKey(
  worktree: Worktree,
  state: ReturnType<typeof useAppStore.getState>,
  hostId: BacklogRoute['executionHostId']
): string | null {
  if (worktree.repoId.startsWith('folder-workspace:')) {
    return `folder:${worktree.id}`
  }
  const repo = state.repos.find(
    (candidate) => candidate.id === worktree.repoId && getRepoExecutionHostId(candidate) === hostId
  )
  return repo ? getProjectIdentityKey(repo) : null
}

function allWorkspaceRows(state: ReturnType<typeof useAppStore.getState>): Worktree[] {
  const rows = [
    ...Object.values(state.worktreesByRepo).flat(),
    ...Object.values(state.detectedWorktreesByRepo).flatMap((result) => result.worktrees),
    ...state.folderWorkspaces.map(folderWorkspaceToWorktree)
  ] as Worktree[]
  return [
    ...new Map(
      rows.map((workspace) => [
        JSON.stringify([
          workspace.id,
          workspace.hostId ?? null,
          workspace.runtimeOwnerEnvironmentId ?? null
        ]),
        workspace
      ])
    ).values()
  ]
}

export function getBacklogTaskWorkspaceOptions(sourceRoute: BacklogRoute): Worktree[] {
  const state = useAppStore.getState()
  const source = state.getKnownWorktreeById(sourceRoute.workspaceId, sourceRoute.executionHostId)
  if (!source) {
    return []
  }
  const sourceProject = projectKey(source, state, sourceRoute.executionHostId)
  if (!sourceProject) {
    return []
  }
  return allWorkspaceRows(state).filter((workspace) => {
    const resolved = state.getKnownWorktreeById(workspace.id, sourceRoute.executionHostId)
    const rowHostMatches = workspace.hostId
      ? workspace.hostId === sourceRoute.executionHostId ||
        (workspace.runtimeOwnerEnvironmentId
          ? toRuntimeExecutionHostId(workspace.runtimeOwnerEnvironmentId) ===
            sourceRoute.executionHostId
          : false)
      : sourceRoute.executionHostId === 'local'
    return (
      rowHostMatches &&
      resolved?.path === workspace.path &&
      projectKey(workspace, state, sourceRoute.executionHostId) === sourceProject
    )
  })
}

function optionHistory(session: {
  filePath: string
  codexHome: string | null
  cwd: string | null
}): BacklogTaskConversationOption['history'] {
  return {
    filePath: session.filePath,
    ...(session.codexHome ? { codexHome: session.codexHome } : {}),
    ...(session.cwd ? { cwd: session.cwd } : {})
  }
}

export async function getBacklogTaskConversationOptions(
  targetRoute: BacklogRoute
): Promise<BacklogTaskConversationOption[]> {
  // The existing history API cannot address an SSH connection owned by another runtime.
  if (
    targetRoute.runtimeEnvironmentId &&
    parseExecutionHostId(targetRoute.executionHostId)?.kind === 'ssh'
  ) {
    return []
  }
  const state = useAppStore.getState()
  const workspace = state.getKnownWorktreeById(targetRoute.workspaceId, targetRoute.executionHostId)
  if (!workspace) {
    throw new Error('The target workspace is no longer available.')
  }
  const result = await window.api.aiVault.listSessions({
    executionHostScope: targetRoute.executionHostId,
    scopePaths: [workspace.path],
    unlimited: true
  })
  if (result.cancelled) {
    return []
  }
  const worktrees = allWorkspaceRows(state)
  const worktreeBySession = getAiVaultSessionWorktreeMap({
    sessions: result.sessions,
    repos: state.repos,
    worktrees
  })
  const options: BacklogTaskConversationOption[] = []
  const originalPaneIndex = getAiVaultOriginalPaneIndex(state)
  for (const session of result.sessions) {
    if (
      session.subagent ||
      session.executionHostId !== targetRoute.executionHostId ||
      worktreeBySession.get(session.id)?.worktreeId !== targetRoute.workspaceId
    ) {
      continue
    }
    const providerSession = getAiVaultAgentProviderSession(session) ?? undefined
    const history = optionHistory(session)
    const updatedAt = session.updatedAt ?? session.modifiedAt ?? null
    if (session.structuredSession) {
      if (session.structuredSession.workspaceId === targetRoute.workspaceId) {
        options.push({
          id: `structured:${session.structuredSession.sessionId}`,
          title: session.title,
          updatedAt,
          surface: 'structured',
          agent: session.agent,
          ...(providerSession ? { providerSession } : {}),
          structuredSessionId: session.structuredSession.sessionId,
          history
        })
      }
      continue
    }
    const terminal = findOriginalAiVaultSessionPaneInIndex(originalPaneIndex, session)
    if (terminal && terminal.worktreeId !== targetRoute.workspaceId) {
      // The provider already has a live writer elsewhere; a history resume here would duplicate it.
      continue
    }
    const ptyId = terminal
      ? state.terminalLayoutsByTabId[terminal.tabId]?.ptyIdsByLeafId?.[terminal.leafId]
      : undefined
    options.push({
      id: terminal
        ? `terminal:${terminal.paneKey}:${session.sessionId}`
        : `history:${session.agent}:${session.sessionId}`,
      title: session.title,
      updatedAt,
      surface: 'terminal',
      agent: session.agent,
      ...(providerSession ? { providerSession } : {}),
      history,
      ...(terminal && terminal.worktreeId === targetRoute.workspaceId
        ? { terminal: { ...terminal, ...(ptyId ? { ptyId } : {}) } }
        : {})
    })
  }
  return options.sort(
    (left, right) =>
      (right.updatedAt ? Date.parse(right.updatedAt) : 0) -
      (left.updatedAt ? Date.parse(left.updatedAt) : 0)
  )
}
