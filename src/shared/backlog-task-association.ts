import {
  hasUnsafeProviderSessionIdChars,
  isResumableTuiAgent,
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from './agent-session-resume'
import { parseExecutionHostId, type ExecutionHostId } from './execution-host'

export const BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY = 'backlog.task-associations.v1' as const

export type BacklogTaskAssociationDeliveryStatus = 'pending' | 'confirmed' | 'unverified'

export type BacklogTaskAssociationWorkspace = {
  workspaceId: string
  kind: 'git-worktree' | 'folder'
}

export type BacklogTaskAssociationSession = {
  title?: string
  agent?: string
  structuredSessionId?: string
  providerSession?: AgentProviderSessionMetadata
  history?: {
    filePath: string
    codexHome?: string
    cwd?: string
  }
}

export type BacklogTaskAssociationTerminal = {
  tabId: string
  leafId?: string
  paneKey?: string
  ptyId?: string
  launchAgent?: ResumableTuiAgent
}

/** Durable handoff from one Backlog.md task to the workspace/session created for it. */
export type BacklogTaskAssociation = {
  projectId: string
  executionHostId: ExecutionHostId
  taskId: string
  sourceWorkspace: BacklogTaskAssociationWorkspace
  targetWorkspace: BacklogTaskAssociationWorkspace
  session: BacklogTaskAssociationSession
  terminal?: BacklogTaskAssociationTerminal
  attemptId: string
  deliveryStatus: BacklogTaskAssociationDeliveryStatus
  createdAt: number
  updatedAt: number
}

export type BacklogTaskAssociationGetParams = {
  workspaceId: string
  executionHostId?: string
  taskId: string
}

export type BacklogTaskAssociationGetResult = {
  association: BacklogTaskAssociation | null
}

export type BacklogTaskAssociationUpsertParams = BacklogTaskAssociationGetParams & {
  targetWorkspace: BacklogTaskAssociationWorkspace
  session: BacklogTaskAssociationSession
  terminal?: BacklogTaskAssociationTerminal
  attemptId: string
  deliveryStatus: BacklogTaskAssociationDeliveryStatus
  /** Null asserts creation; a value fences replacement or a same-attempt status update. */
  expectedAttemptId: string | null
}

export type BacklogTaskAssociationWrite = Omit<
  BacklogTaskAssociationUpsertParams,
  'workspaceId' | 'executionHostId'
>

export type BacklogTaskAssociationUpsertResult = {
  association: BacklogTaskAssociation
}

export type BacklogTaskAssociationConfirmParams = BacklogTaskAssociationGetParams & {
  attemptId: string
}

export type BacklogTaskAssociationConfirmResult = {
  association: BacklogTaskAssociation
}

const MAX_ID_LENGTH = 512
const MAX_PATH_LENGTH = 4096

function boundedString(value: unknown, max = MAX_ID_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !hasUnsafeProviderSessionIdChars(value)
  )
}

function normalizeWorkspace(value: unknown): BacklogTaskAssociationWorkspace | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const workspace = value as Partial<BacklogTaskAssociationWorkspace>
  return boundedString(workspace.workspaceId) &&
    (workspace.kind === 'git-worktree' || workspace.kind === 'folder')
    ? { workspaceId: workspace.workspaceId, kind: workspace.kind }
    : null
}

function normalizeSession(value: unknown): BacklogTaskAssociationSession | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const session = value as Partial<BacklogTaskAssociationSession>
  if (
    (session.title !== undefined && !boundedString(session.title)) ||
    (session.agent !== undefined && !boundedString(session.agent))
  ) {
    return null
  }
  if (session.structuredSessionId !== undefined && !boundedString(session.structuredSessionId)) {
    return null
  }
  const providerSession =
    session.providerSession === undefined
      ? undefined
      : (normalizeAgentProviderSession(session.providerSession) ?? null)
  if (providerSession === null) {
    return null
  }
  let history: BacklogTaskAssociationSession['history']
  if (session.history !== undefined) {
    if (!session.history || !boundedString(session.history.filePath, MAX_PATH_LENGTH)) {
      return null
    }
    if (
      session.history.codexHome !== undefined &&
      !boundedString(session.history.codexHome, MAX_PATH_LENGTH)
    ) {
      return null
    }
    if (session.history.cwd !== undefined && !boundedString(session.history.cwd, MAX_PATH_LENGTH)) {
      return null
    }
    history = { ...session.history }
  }
  return {
    ...(session.title ? { title: session.title } : {}),
    ...(session.agent ? { agent: session.agent } : {}),
    ...(session.structuredSessionId ? { structuredSessionId: session.structuredSessionId } : {}),
    ...(providerSession ? { providerSession } : {}),
    ...(history ? { history } : {})
  }
}

function normalizeTerminal(value: unknown): BacklogTaskAssociationTerminal | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const terminal = value as Partial<BacklogTaskAssociationTerminal>
  if (!boundedString(terminal.tabId)) {
    return null
  }
  for (const field of ['leafId', 'paneKey', 'ptyId'] as const) {
    if (terminal[field] !== undefined && !boundedString(terminal[field])) {
      return null
    }
  }
  if (terminal.launchAgent !== undefined && !isResumableTuiAgent(terminal.launchAgent)) {
    return null
  }
  return { ...terminal } as BacklogTaskAssociationTerminal
}

/** Treat the profile file as untrusted and discard rows that cannot safely drive restoration. */
export function normalizeBacklogTaskAssociations(raw: unknown): BacklogTaskAssociation[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const byKey = new Map<string, BacklogTaskAssociation>()
  for (const value of raw) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const row = value as Partial<BacklogTaskAssociation>
    const host = parseExecutionHostId(row.executionHostId)
    const sourceWorkspace = normalizeWorkspace(row.sourceWorkspace)
    const targetWorkspace = normalizeWorkspace(row.targetWorkspace)
    const session = normalizeSession(row.session)
    const terminal = row.terminal === undefined ? undefined : normalizeTerminal(row.terminal)
    if (
      !boundedString(row.projectId) ||
      !host ||
      !boundedString(row.taskId, 256) ||
      !sourceWorkspace ||
      !targetWorkspace ||
      !session ||
      (row.terminal !== undefined && !terminal) ||
      !boundedString(row.attemptId) ||
      (row.deliveryStatus !== 'pending' &&
        row.deliveryStatus !== 'confirmed' &&
        row.deliveryStatus !== 'unverified') ||
      !Number.isSafeInteger(row.createdAt) ||
      !Number.isSafeInteger(row.updatedAt)
    ) {
      continue
    }
    const association = {
      ...row,
      executionHostId: host.id,
      sourceWorkspace,
      targetWorkspace,
      session,
      ...(terminal ? { terminal } : {})
    } as BacklogTaskAssociation
    const key = [association.projectId, association.executionHostId, association.taskId].join('\0')
    const prior = byKey.get(key)
    if (!prior || association.updatedAt >= prior.updatedAt) {
      byKey.set(key, association)
    }
  }
  return [...byKey.values()]
}
