import React, { useCallback, useMemo } from 'react'
import { ChevronRight, History, LoaderCircle, RefreshCw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'
import type { AiVaultSessionResumeTargetState } from '../right-sidebar/ai-vault-session-resume'
import { useAiVaultSessionLaunchActions } from '../right-sidebar/ai-vault-session-launch-actions'
import { getAiVaultSessionWorktreeMap } from '../right-sidebar/ai-vault-session-worktree'
import {
  findOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from '../right-sidebar/ai-vault-original-pane-index'
import { EMPTY_AI_VAULT_SESSIONS } from '../right-sidebar/ai-vault-session-identity'
import { requestAiVaultWorkspaceHistory } from '../right-sidebar/ai-vault-navigation-request'
import { useConversationHistoryCatalog } from './conversation-history-catalog'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import {
  getWorktreeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { ConversationHistorySessionRow } from './ConversationHistorySessionRow'

const MAX_INLINE_HISTORY_SESSIONS = 5

let combinedGitWorktrees: readonly Worktree[] | null = null
let combinedFolderWorkspaces: readonly FolderWorkspace[] | null = null
let combinedWorkspaces: readonly Worktree[] = []

function combineWorkspaceCatalog(
  worktrees: readonly Worktree[],
  folderWorkspaces: readonly FolderWorkspace[]
): readonly Worktree[] {
  if (worktrees !== combinedGitWorktrees || folderWorkspaces !== combinedFolderWorkspaces) {
    combinedGitWorktrees = worktrees
    combinedFolderWorkspaces = folderWorkspaces
    combinedWorkspaces = [
      ...worktrees,
      ...folderWorkspaces.map((workspace) => folderWorkspaceToWorktree(workspace))
    ]
  }
  return combinedWorkspaces
}

function sessionActivityTime(session: AiVaultSession): number {
  const timestamp = Date.parse(session.updatedAt ?? session.modifiedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function ConversationHistoryBody({
  worktree,
  executionHostId,
  disconnected
}: {
  worktree: Worktree
  executionHostId: ExecutionHostId
  disconnected: boolean
}): React.JSX.Element {
  const allGitWorktrees = useAllWorktrees()
  const state = useAppStore(
    useShallow((store) => ({
      folderWorkspaces: store.folderWorkspaces,
      projectGroups: store.projectGroups,
      repos: store.repos,
      worktreesByRepo: store.worktreesByRepo,
      detectedWorktreesByRepo: store.detectedWorktreesByRepo,
      restoredRuntimeHostIdByWorkspaceSessionKey: store.restoredRuntimeHostIdByWorkspaceSessionKey,
      activeWorktreeId: store.activeWorktreeId,
      activeWorkspaceExecutionHostId: store.activeWorkspaceExecutionHostId,
      runtimeEnvironments: store.runtimeEnvironments,
      runtimeEnvironmentCatalogHydrated: store.runtimeEnvironmentCatalogHydrated,
      removedRuntimeEnvironmentIds: store.removedRuntimeEnvironmentIds,
      agentStatusByPaneKey: store.agentStatusByPaneKey,
      retainedAgentsByPaneKey: store.retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey: store.sleepingAgentSessionsByPaneKey,
      tabsByWorktree: store.tabsByWorktree,
      terminalLayoutsByTabId: store.terminalLayoutsByTabId,
      settings: store.settings
    }))
  )
  const allWorkspaces = combineWorkspaceCatalog(allGitWorktrees, state.folderWorkspaces)
  const hostAgentSessionIdsKey = useMemo(
    () =>
      Object.values(state.agentStatusByPaneKey)
        .filter((entry) => {
          if (!entry.providerSession?.id || !entry.worktreeId) {
            return false
          }
          const workspace = allWorkspaces.find((candidate) => candidate.id === entry.worktreeId)
          return (
            workspace &&
            getWorktreeExecutionHostId(
              workspace,
              state.repos.find((candidate) => candidate.id === workspace.repoId)
            ) === executionHostId
          )
        })
        .map((entry) => entry.providerSession!.id)
        .sort()
        .join('\n'),
    [allWorkspaces, executionHostId, state.agentStatusByPaneKey, state.repos]
  )
  const catalog = useConversationHistoryCatalog(
    executionHostId,
    !disconnected,
    hostAgentSessionIdsKey
  )
  const targetState: AiVaultSessionResumeTargetState = state
  const sessions = catalog.result?.sessions ?? EMPTY_AI_VAULT_SESSIONS
  const sessionWorktreeById = useMemo(
    () =>
      getAiVaultSessionWorktreeMap({
        sessions,
        repos: state.repos,
        worktrees: allWorkspaces
      }),
    [allWorkspaces, sessions, state.repos]
  )
  const originalPaneIndex = useMemo(
    () =>
      getAiVaultOriginalPaneIndex({
        agentStatusByPaneKey: state.agentStatusByPaneKey,
        retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
        sleepingAgentSessionsByPaneKey: state.sleepingAgentSessionsByPaneKey,
        tabsByWorktree: state.tabsByWorktree,
        terminalLayoutsByTabId: state.terminalLayoutsByTabId,
        repos: state.repos,
        worktreesByRepo: state.worktreesByRepo,
        detectedWorktreesByRepo: state.detectedWorktreesByRepo,
        folderWorkspaces: state.folderWorkspaces,
        projectGroups: state.projectGroups,
        restoredRuntimeHostIdByWorkspaceSessionKey:
          state.restoredRuntimeHostIdByWorkspaceSessionKey,
        activeWorktreeId: state.activeWorktreeId,
        activeWorkspaceExecutionHostId: state.activeWorkspaceExecutionHostId,
        settings: state.settings,
        runtimeEnvironments: state.runtimeEnvironments,
        runtimeEnvironmentCatalogHydrated: state.runtimeEnvironmentCatalogHydrated,
        removedRuntimeEnvironmentIds: state.removedRuntimeEnvironmentIds
      }),
    [
      state.agentStatusByPaneKey,
      state.retainedAgentsByPaneKey,
      state.sleepingAgentSessionsByPaneKey,
      state.tabsByWorktree,
      state.terminalLayoutsByTabId,
      state.repos,
      state.worktreesByRepo,
      state.detectedWorktreesByRepo,
      state.folderWorkspaces,
      state.projectGroups,
      state.restoredRuntimeHostIdByWorkspaceSessionKey,
      state.activeWorktreeId,
      state.activeWorkspaceExecutionHostId,
      state.settings,
      state.runtimeEnvironments,
      state.runtimeEnvironmentCatalogHydrated,
      state.removedRuntimeEnvironmentIds
    ]
  )
  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.subagent === null)
        .filter((session) => sessionWorktreeById.get(session.id)?.worktreeId === worktree.id)
        .filter(
          (session) =>
            !session.structuredSession || session.structuredSession.ownerState === 'unverifiable'
        )
        .filter((session) => !findOriginalAiVaultSessionPaneInIndex(originalPaneIndex, session))
        .sort((left, right) => sessionActivityTime(right) - sessionActivityTime(left))
        .slice(0, MAX_INLINE_HISTORY_SESSIONS),
    [originalPaneIndex, sessionWorktreeById, sessions, worktree.id]
  )
  const launchActions = useAiVaultSessionLaunchActions({
    activeWorktree: worktree,
    activeWorktreeId: worktree.id,
    targetState,
    agentCmdOverrides: state.settings?.agentCmdOverrides
  })

  if (disconnected) {
    return (
      <div className="px-1.5 py-1.5 text-[10.5px] leading-4 text-muted-foreground">
        {translate(
          'auto.components.sidebar.WorktreeConversationHistory.disconnected',
          'Connect this workspace host to load conversation history.'
        )}
      </div>
    )
  }
  if (catalog.status === 'loading' && !catalog.result) {
    return (
      <div className="flex items-center gap-1.5 px-1.5 py-1.5 text-[10.5px] text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        {translate(
          'auto.components.sidebar.WorktreeConversationHistory.loading',
          'Loading conversations…'
        )}
      </div>
    )
  }
  if (catalog.status === 'error' && !catalog.result) {
    return (
      <div className="flex items-center justify-between gap-2 px-1.5 py-1 text-[10.5px] leading-4 text-destructive">
        <span className="min-w-0">{catalog.error}</span>
        <Button variant="ghost" size="xs" className="h-6 shrink-0 px-1.5" onClick={catalog.retry}>
          <RefreshCw className="size-3" />
          {translate('auto.components.sidebar.WorktreeConversationHistory.retry', 'Retry')}
        </Button>
      </div>
    )
  }
  if (visibleSessions.length === 0) {
    return (
      <div className="px-1.5 py-1 text-[10.5px] leading-4 text-muted-foreground">
        {translate(
          'auto.components.sidebar.WorktreeConversationHistory.empty',
          'No unopened conversations in this workspace.'
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 pt-0.5">
      {visibleSessions.map((session) => (
        <ConversationHistorySessionRow
          key={session.id}
          session={session}
          worktree={worktree}
          worktreeInfo={sessionWorktreeById.get(session.id) ?? null}
          targetState={targetState}
          settings={state.settings}
          onOpen={launchActions.handleOpen}
        />
      ))}
    </div>
  )
}

export function WorktreeConversationHistory({
  worktree,
  repo,
  isSshDisconnected,
  isRuntimeDisconnected
}: {
  worktree: Worktree
  repo: Repo | undefined
  isSshDisconnected: boolean
  isRuntimeDisconnected: boolean
}): React.JSX.Element {
  const executionHostId = getWorktreeExecutionHostId(worktree, repo)
  const workspaceIdentity = getWorktreeHostIdentity({ ...worktree, hostId: executionHostId })
  const expanded = useAppStore(
    (state) => state.conversationHistoryExpandedByWorkspace[workspaceIdentity] === true
  )
  const setExpanded = useAppStore((state) => state.setConversationHistoryExpanded)
  const parsedHost = parseExecutionHostId(executionHostId)
  const remoteDisconnected = useAppStore((state) => {
    if (parsedHost?.kind === 'ssh') {
      return state.sshConnectionStates.get(parsedHost.targetId)?.status !== 'connected'
    }
    return false
  })
  const disconnected = isSshDisconnected || isRuntimeDisconnected || remoteDisconnected
  const toggle = useCallback(() => {
    setExpanded(workspaceIdentity, !expanded)
  }, [expanded, setExpanded, workspaceIdentity])
  const showFullHistory = useCallback(() => {
    const parsed = parseWorkspaceKey(worktree.id)
    const activated =
      parsed?.type === 'folder'
        ? activateAndRevealFolderWorkspace(parsed.folderWorkspaceId, { executionHostId })
        : activateAndRevealWorktree(worktree.id, { executionHostId })
    if (!activated) {
      return
    }
    requestAiVaultWorkspaceHistory(worktree.id, executionHostId)
    const store = useAppStore.getState()
    store.setRightSidebarTab('vault')
    store.setRightSidebarOpen(true)
  }, [executionHostId, worktree.id])
  const fullHistoryLabel = translate(
    'auto.components.sidebar.WorktreeConversationHistory.showFullHistory',
    'Show full history'
  )

  return (
    <section
      className="mt-0.5 border-t border-worktree-sidebar-border/60 pt-0.5"
      aria-label={translate(
        'auto.components.sidebar.WorktreeConversationHistory.label',
        'Conversation History'
      )}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="group/history-header flex h-6 min-w-0 items-center rounded-md hover:bg-worktree-sidebar-accent">
        <button
          type="button"
          className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left text-[10.5px] font-semibold text-muted-foreground outline-none group-hover/history-header:text-foreground focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
          aria-expanded={expanded}
          onClick={toggle}
        >
          <ChevronRight className={cn('size-3 transition-transform', expanded && 'rotate-90')} />
          <span className="truncate">
            {translate(
              'auto.components.sidebar.WorktreeConversationHistory.label',
              'Conversation History'
            )}
          </span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mr-0.5 size-5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={fullHistoryLabel}
              onClick={showFullHistory}
            >
              <History className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {fullHistoryLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      {expanded ? (
        <ConversationHistoryBody
          worktree={worktree}
          executionHostId={executionHostId}
          disconnected={disconnected}
        />
      ) : null}
    </section>
  )
}
