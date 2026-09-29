import type { PtyManagementSession } from '../../../../preload/api/pty-management-api'
import type { AppState } from '../../store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { parsePtySessionId } from '../../../../shared/pty-session-id-format'
import {
  getRepoIdFromWorktreeId,
  getWorktreePathBasenameFromId
} from '../../../../shared/worktree/id'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { buildResourceSessionBindingIndex } from '../status-bar/resource-session-bindings'

export type ManagerContext = Pick<
  AppState,
  | 'tabsByWorktree'
  | 'ptyIdsByTabId'
  | 'terminalLayoutsByTabId'
  | 'workspaceSessionReady'
  | 'repos'
  | 'worktreesByRepo'
  | 'agentStatusByPaneKey'
  | 'runtimePaneTitlesByTabId'
  | 'lastTerminalInputAtByPaneKey'
  | 'memorySnapshot'
>
export type ManagerFilter = 'all' | 'working' | 'waiting' | 'orphan' | 'independent'
export type ManagerRow = {
  key: string
  session: PtyManagementSession
  label: string
  provider: string | null
  state: 'working' | 'waiting' | 'blocked' | 'done' | 'running' | 'unknown' | 'exited'
  binding: 'bound' | 'orphan' | 'owned' | 'unknown'
  independent: boolean
  projectId: string | null
  projectName: string | null
  workspaceName: string | null
  tabId: string | null
  paneKey: string | null
  createdAt: number | null
  lastUsedAt: number | null
  cpu: number | null
  memory: number | null
}

export function sessionSelectionKey(session: PtyManagementSession): string {
  return JSON.stringify([session.sessionId, session.incarnationId ?? null, session.protocolVersion])
}

export function buildManagerRows(
  sessions: readonly PtyManagementSession[],
  ctx: ManagerContext
): ManagerRow[] {
  const index = buildResourceSessionBindingIndex(ctx)
  const repos = new Map(ctx.repos.map((repo) => [repo.id, repo]))
  const workspaces = new Map(
    Object.values(ctx.worktreesByRepo)
      .flat()
      .map((wt) => [wt.id, wt])
  )
  const metrics = new Map(
    ctx.memorySnapshot?.worktrees.flatMap((wt) => wt.sessions.map((s) => [s.sessionId, s] as const))
  )
  // Only daemon inventory creates rows; memory samples and renderer tabs never add processes.
  return sessions.map((session) => {
    const tabId = index.ptyIdToTabId.get(session.sessionId) ?? null
    const workspaceId =
      (tabId ? index.tabIdToWorktreeId.get(tabId) : null) ??
      session.worktreeId ??
      parsePtySessionId(session.sessionId).worktreeId
    const tab = workspaceId
      ? ctx.tabsByWorktree[workspaceId]?.find((t) => t.id === tabId)
      : undefined
    const independent = workspaceId === FLOATING_TERMINAL_WORKTREE_ID
    const workspace = workspaceId ? workspaces.get(workspaceId) : undefined
    const projectId =
      independent || !workspaceId
        ? null
        : (workspace?.repoId ?? getRepoIdFromWorktreeId(workspaceId))
    const repo = projectId ? repos.get(projectId) : undefined
    const hostKind = repo ? parseExecutionHostId(getRepoExecutionHostId(repo))?.kind : null
    const canNavigate =
      hostKind !== 'ssh' && hostKind !== 'runtime' && !workspace?.runtimeOwnerEnvironmentId
    const leafId = tabId
      ? Object.entries(ctx.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}).find(
          ([, id]) => id === session.sessionId
        )?.[0]
      : null
    const sample = metrics.get(session.sessionId)
    const paneKey = tabId && leafId ? `${tabId}:${leafId}` : (sample?.paneKey ?? null)
    const status = paneKey ? ctx.agentStatusByPaneKey[paneKey] : undefined
    const ownership = session.agentOwnership ?? 'unknown'
    const binding =
      session.paneBound || (ctx.workspaceSessionReady && index.boundPtyIds.has(session.sessionId))
        ? 'bound'
        : ownership === 'present'
          ? 'owned'
          : ctx.workspaceSessionReady && ownership === 'absent'
            ? 'orphan'
            : 'unknown'
    const inputAt = paneKey ? ctx.lastTerminalInputAtByPaneKey[paneKey] : undefined
    const createdAt =
      Number.isFinite(session.createdAt) && session.createdAt > 0 ? session.createdAt : null
    return {
      key: sessionSelectionKey(session),
      session,
      label:
        tab?.customTitle?.trim() ||
        (tabId && leafId ? ctx.runtimePaneTitlesByTabId[tabId]?.[leafId]?.trim() : null) ||
        tab?.title?.trim() ||
        session.cwd ||
        session.sessionId,
      provider: status?.agentType ?? tab?.launchAgent ?? null,
      state: !session.isAlive
        ? 'exited'
        : status && !status.restoredUnconfirmed && !status.connectionId
          ? status.state
          : ownership === 'present' || tab?.launchAgent
            ? 'unknown'
            : 'running',
      binding,
      independent,
      projectId,
      projectName: repo?.displayName || projectId,
      workspaceName:
        workspace?.displayName ||
        (workspaceId && !independent ? getWorktreePathBasenameFromId(workspaceId) : null),
      tabId: canNavigate ? tabId : null,
      paneKey,
      createdAt,
      lastUsedAt: inputAt && (!createdAt || inputAt >= createdAt) ? inputAt : null,
      cpu: sample?.cpu ?? null,
      memory: sample?.memory ?? null
    }
  })
}

export function filterManagerRows(
  rows: readonly ManagerRow[],
  query: string,
  filter: ManagerFilter,
  projectId: string
): ManagerRow[] {
  const needle = query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (projectId !== 'all' && row.projectId !== projectId) {
      return false
    }
    if (filter === 'orphan' && row.binding !== 'orphan') {
      return false
    }
    if (filter === 'independent' && !row.independent) {
      return false
    }
    if (filter === 'working' && row.state !== 'working') {
      return false
    }
    if (filter === 'waiting' && row.state !== 'waiting' && row.state !== 'blocked') {
      return false
    }
    return (
      !needle ||
      [
        row.label,
        row.provider,
        row.projectName,
        row.workspaceName,
        row.session.cwd,
        row.session.sessionId
      ].some((v) => v?.toLocaleLowerCase().includes(needle))
    )
  })
}
