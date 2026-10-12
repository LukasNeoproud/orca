import { isResumableTuiAgent } from '../../../src/shared/agent-session-resume'
import type {
  BacklogTaskAssociationSession,
  BacklogTaskAssociationTerminal,
  BacklogTaskAssociationWorkspace
} from '../../../src/shared/backlog-task-association'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import { isMobileTuiAgent } from '../tasks/mobile-tui-agents'
import type { MobileSessionTab, SessionTabsResult } from '../session/mobile-session-route-types'
import type { Worktree } from '../worktree/workspace-list-types'

export type MobileBacklogConversationOption = {
  id: string
  title: string
  surface: 'structured' | 'terminal'
  agent: TuiAgent
  session: BacklogTaskAssociationSession
  terminal?: BacklogTaskAssociationTerminal
  terminalHandle?: string
}

function isFolderWorkspace(workspace: Worktree): boolean {
  return (
    workspace.workspaceKind === 'folder-workspace' ||
    workspace.worktreeId.startsWith('folder:') ||
    workspace.repoId.startsWith('folder-workspace:')
  )
}

function executionHostKey(workspace: Worktree): string {
  return workspace.hostId ?? 'local'
}

export function mobileBacklogAssociationWorkspace(
  workspace: Pick<Worktree, 'worktreeId' | 'workspaceKind' | 'repoId'>
): BacklogTaskAssociationWorkspace {
  return {
    workspaceId: workspace.worktreeId,
    kind:
      workspace.workspaceKind === 'folder-workspace' ||
      workspace.worktreeId.startsWith('folder:') ||
      workspace.repoId.startsWith('folder-workspace:')
        ? 'folder'
        : 'git-worktree'
  }
}

export function selectMobileBacklogProjectWorkspaces(
  sourceWorkspaceId: string,
  workspaces: readonly Worktree[]
): Worktree[] {
  const source = workspaces.find((workspace) => workspace.worktreeId === sourceWorkspaceId)
  if (!source) {
    return []
  }
  if (isFolderWorkspace(source)) {
    return [source]
  }
  const sourceHost = executionHostKey(source)
  return workspaces.filter(
    (workspace) =>
      !workspace.isArchived &&
      !isFolderWorkspace(workspace) &&
      workspace.repoId === source.repoId &&
      executionHostKey(workspace) === sourceHost
  )
}

export function readMobileBacklogConversationOptions(
  value: unknown
): MobileBacklogConversationOption[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as SessionTabsResult).tabs)) {
    return []
  }
  return (value as SessionTabsResult).tabs.flatMap(readConversationTab)
}

function readConversationTab(tab: MobileSessionTab): MobileBacklogConversationOption[] {
  if (tab.type === 'agent-session') {
    // Registry-provided structured agents have no TUI identity a Backlog handoff can name.
    if (!isMobileTuiAgent(tab.agent)) {
      return []
    }
    return [
      {
        id: `structured:${tab.sessionId}`,
        title: tab.title || `${tab.agent} chat`,
        surface: 'structured',
        agent: tab.agent,
        session: {
          title: tab.title || `${tab.agent} chat`,
          agent: tab.agent,
          structuredSessionId: tab.sessionId
        }
      }
    ]
  }
  if (tab.type !== 'terminal' || !tab.terminal) {
    return []
  }
  const agent = isMobileTuiAgent(tab.launchAgent)
    ? tab.launchAgent
    : isMobileTuiAgent(tab.agentStatus?.agentType)
      ? tab.agentStatus.agentType
      : null
  if (!agent) {
    return []
  }
  const providerSession = tab.agentStatus?.providerSession
  const terminal: BacklogTaskAssociationTerminal = {
    tabId: tab.id,
    ...(tab.leafId ? { leafId: tab.leafId } : {}),
    ...(tab.agentStatus?.paneKey
      ? { paneKey: tab.agentStatus.paneKey }
      : tab.leafId
        ? { paneKey: `${tab.id}:${tab.leafId}` }
        : {}),
    ...(isResumableTuiAgent(agent) ? { launchAgent: agent } : {})
  }
  return [
    {
      id: `terminal:${tab.id}:${tab.leafId ?? ''}`,
      title: tab.title || `${agent} terminal`,
      surface: 'terminal',
      agent,
      session: {
        title: tab.title || `${agent} terminal`,
        agent,
        ...(providerSession ? { providerSession } : {})
      },
      terminal,
      terminalHandle: tab.terminal
    }
  ]
}
